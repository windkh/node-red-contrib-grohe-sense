'use strict';

const assert = require('assert');
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
                valve_open: true, measure_now: true, pressure_measurement_running: false,
                buzzer_on: true, buzzer_sound_profile: 2, reason_for_change: 1,
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
