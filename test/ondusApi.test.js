'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const ondusApi = require('../grohe/lib/ondusApi');

describe('lib/ondusApi', function () {
    describe('OndusType', function () {
        it('exposes the known appliance type ids', function () {
            assert.strictEqual(ondusApi.OndusType.Sense, 101);
            assert.strictEqual(ondusApi.OndusType.SensePlus, 102);
            assert.strictEqual(ondusApi.OndusType.SenseGuard, 103);
        });

        it('is frozen', function () {
            assert.ok(Object.isFrozen(ondusApi.OndusType));
            assert.throws(function () {
                'use strict';
                ondusApi.OndusType.Sense = 999;
            });
        });
    });

    describe('applyLoginResponse', function () {
        // Node lower-cases response header names, so a login response is delivered
        // with 'location' / 'set-cookie'.
        function loginResponse(status, extra) {
            const response = {
                status: status,
                text: '',
                header: { 'set-cookie': ['AWSALB=abc', 'AWSALBCORS=def'] },
            };
            return Object.assign(response, extra);
        }

        it('takes the action url out of the web form and decodes the entities', function () {
            const session = new ondusApi.OndusSession();
            const response = loginResponse(200, {
                text: '<form action="https://host/auth?session_code=x&amp;tab_id=y" method="post">',
            });

            assert.strictEqual(session.applyLoginResponse(response), null);
            assert.strictEqual(session.actionUrl, 'https://host/auth?session_code=x&tab_id=y');
            assert.deepStrictEqual(session.cookie, ['AWSALB=abc', 'AWSALBCORS=def']);
        });

        it('reports a missing action and leaves the session alone', function () {
            const session = new ondusApi.OndusSession();
            const response = loginResponse(200, { text: '<html>no form here</html>' });

            assert.strictEqual(session.applyLoginResponse(response), 'action not found in webform.');
            assert.strictEqual(session.actionUrl, undefined);
            assert.strictEqual(session.cookie, undefined);
        });

        it('reads the redirect target from the lower-case location header on a 302', function () {
            const session = new ondusApi.OndusSession();
            const response = loginResponse(302, {
                header: {
                    'set-cookie': ['AWSALB=abc'],
                    location: 'https://host/v1/sso/auth/realms/idm-apigw/protocol/openid-connect/auth?redirect_uri=x',
                },
            });

            assert.strictEqual(session.applyLoginResponse(response), null);
            assert.strictEqual(
                session.tokenUrl,
                'https://host/v1/sso/auth/realms/idm-apigw/protocol/openid-connect/auth?redirect_uri=x'
            );
            assert.deepStrictEqual(session.cookie, ['AWSALB=abc']);
        });

        it('reports any other status', function () {
            const session = new ondusApi.OndusSession();

            const failure = session.applyLoginResponse(loginResponse(500));
            assert.ok(/^Failed to get response from https:\/\//.test(failure), failure);
            assert.strictEqual(session.actionUrl, undefined);
            assert.strictEqual(session.tokenUrl, undefined);
        });
    });

    describe('buildApplianceCommand', function () {
        const session = new ondusApi.OndusSession();

        it('whitelists command keys and drops unknown ones', function () {
            const body = session.buildApplianceCommand('app-1', 103, { valve_open: true, hacker: 'x', data: {} });
            assert.deepStrictEqual(body, {
                appliance_id: 'app-1',
                type: 103,
                command: { valve_open: true },
            });
        });

        it('sets appliance_id and type', function () {
            const body = session.buildApplianceCommand('uuid', 103, { measure_now: true });
            assert.strictEqual(body.appliance_id, 'uuid');
            assert.strictEqual(body.type, 103);
            assert.deepStrictEqual(body.command, { measure_now: true });
        });

        it('includes commandb64 only when provided', function () {
            const without = session.buildApplianceCommand('a', 103, { valve_open: true });
            assert.ok(!('commandb64' in without));

            const with64 = session.buildApplianceCommand('a', 103, { valve_open: true }, 'Zm9v');
            assert.strictEqual(with64.commandb64, 'Zm9v');
        });

        it('keeps all documented command fields', function () {
            const command = {
                valve_open: true,
                measure_now: true,
                pressure_measurement_running: false,
                buzzer_on: true,
                buzzer_sound_profile: 2,
                reason_for_change: 1,
            };
            const body = session.buildApplianceCommand('a', 103, command);
            assert.deepStrictEqual(body.command, command);
        });
    });

    describe('sendApplianceCommand', function () {
        it('POSTs the wrapper to the /command route', function () {
            const session = new ondusApi.OndusSession();
            let captured;
            session.post = function (url, data) {
                captured = { url: url, data: data };
                return Promise.resolve({});
            };

            session.sendApplianceCommand('loc', 'room', 'app', 103, { valve_open: true });

            assert.ok(/\/locations\/loc\/rooms\/room\/appliances\/app\/command$/.test(captured.url), captured.url);
            assert.deepStrictEqual(captured.data, {
                appliance_id: 'app',
                type: 103,
                command: { valve_open: true },
            });
        });
    });

    describe('account-wide notifications', function () {
        // Builds a session whose http verbs just record the call instead of hitting the network.
        function spySession(getResponses) {
            const session = new ondusApi.OndusSession();
            const calls = [];
            let getIndex = 0;
            session.get = (url) => {
                calls.push({ verb: 'GET', url: url });
                const body = getResponses ? getResponses[getIndex++] : { notifications: [], continuationToken: null };
                return Promise.resolve({ text: JSON.stringify(body) });
            };
            session.put = (url, data) => {
                calls.push({ verb: 'PUT', url: url, data: data });
                return Promise.resolve({});
            };
            session.patch = (url, data) => {
                calls.push({ verb: 'PATCH', url: url, data: data });
                return Promise.resolve({});
            };
            session.del = (url, data) => {
                calls.push({ verb: 'DELETE', url: url, data: data });
                return Promise.resolve({});
            };
            return { session: session, calls: calls };
        }

        it('getNotifications builds the paginated query string', function () {
            const { session, calls } = spySession();
            session.getNotifications(50, 'abc');
            assert.strictEqual(calls.length, 1);
            assert.ok(/\/profile\/notifications\?pageSize=50&continuationToken=abc$/.test(calls[0].url), calls[0].url);
        });

        it('getNotifications omits the query when no params are given', function () {
            const { session, calls } = spySession();
            session.getNotifications();
            assert.ok(/\/profile\/notifications$/.test(calls[0].url), calls[0].url);
        });

        it('getAllNotifications follows continuationToken and merges, stopping when empty', async function () {
            const { session, calls } = spySession([
                { notifications: [{ notification_id: '1' }], continuationToken: 'p2' },
                { notifications: [{ notification_id: '2' }], continuationToken: null },
            ]);
            const all = await session.getAllNotifications();
            assert.deepStrictEqual(
                all.map((n) => n.notification_id),
                ['1', '2']
            );
            assert.strictEqual(calls.length, 2);
            assert.ok(/continuationToken=p2$/.test(calls[1].url), calls[1].url);
        });

        it('getAllNotifications respects the page cap', async function () {
            // Always returns a token -> would loop forever without the cap.
            const session = new ondusApi.OndusSession();
            let pages = 0;
            session.get = () => {
                pages++;
                return Promise.resolve({
                    text: JSON.stringify({ notifications: [{ notification_id: 'x' }], continuationToken: 'next' }),
                });
            };
            const all = await session.getAllNotifications();
            assert.strictEqual(pages, 20);
            assert.strictEqual(all.length, 20);
        });

        it('markNotificationRead PUTs the notification with is_read true', async function () {
            const { session, calls } = spySession([{ notification_id: 'n1', is_read: false, title: 't' }]);
            await session.markNotificationRead('n1');
            const put = calls.find((c) => c.verb === 'PUT');
            assert.ok(/\/profile\/notifications\/n1$/.test(put.url), put.url);
            assert.strictEqual(put.data.is_read, true);
            assert.strictEqual(put.data.notification_id, 'n1');
        });

        it('markNotificationsRead PATCHes the array', function () {
            const { session, calls } = spySession();
            session.markNotificationsRead([
                { notification_id: 'a', is_read: true },
                { notification_id: 'b', is_read: true },
            ]);
            const patch = calls.find((c) => c.verb === 'PATCH');
            assert.ok(/\/profile\/notifications$/.test(patch.url), patch.url);
            assert.ok(Array.isArray(patch.data));
            assert.strictEqual(patch.data.length, 2);
        });

        it('deleteNotification DELETEs by id (no body)', function () {
            const { session, calls } = spySession();
            session.deleteNotification('n9');
            const del = calls.find((c) => c.verb === 'DELETE');
            assert.ok(/\/profile\/notifications\/n9$/.test(del.url), del.url);
            assert.strictEqual(del.data, undefined);
        });

        it('deleteNotifications DELETEs with a JSON-array body', function () {
            const { session, calls } = spySession();
            session.deleteNotifications(['a', 'b']);
            const del = calls.find((c) => c.verb === 'DELETE');
            assert.ok(/\/profile\/notifications$/.test(del.url), del.url);
            assert.deepStrictEqual(del.data, ['a', 'b']);
        });

        it('legacy getApplianceNotifications returns account notifications filtered by appliance_id', async function () {
            const { session } = spySession([
                {
                    notifications: [
                        { notification_id: '1', appliance_id: 'A' },
                        { notification_id: '2', appliance_id: 'B' },
                    ],
                    continuationToken: null,
                },
            ]);
            const response = await session.getApplianceNotifications('l', 'r', 'A');
            const parsed = JSON.parse(response.text);
            assert.strictEqual(parsed.length, 1);
            assert.strictEqual(parsed[0].appliance_id, 'A');
        });
    });

    describe('convertNotification', function () {
        it('maps known category and type to a human readable message', function () {
            const notification = { category: 20, type: 11 };
            const result = ondusApi.convertNotification(notification);
            assert.strictEqual(result.category, 'Warning');
            assert.strictEqual(result.type, 11);
            assert.ok(/Battery is at critical level/i.test(result.message));
            assert.strictEqual(result.notification, notification);
        });

        it('reports Unknown for an unknown category', function () {
            const notification = { category: 9999, type: 0 };
            const result = ondusApi.convertNotification(notification);
            assert.strictEqual(result.category, 'Unknown');
            assert.ok(/Unkown notification category: 9999 type: 0/.test(result.message));
        });

        it('reports an Unkown message for a known category with unknown type', function () {
            const notification = { category: 10, type: 99999 };
            const result = ondusApi.convertNotification(notification);
            assert.strictEqual(result.category, 'Information');
            assert.ok(/Unkown notification category: 10 type: 99999/.test(result.message));
        });
    });
});
