'use strict';

const assert = require('assert');
const path = require('path');
const EventEmitter = require('events');

const senseNodeModule = require(path.join('..', 'grohe', 'nodes', 'grohe-sense-node'));
const ondusApi = require(path.join('..', 'grohe', 'lib', 'ondusApi'));

// Builds a GROHE Sense node instance wired to a mocked config node / session so the
// input handler can be exercised without any network access.
function buildHarness(options) {
    options = options || {};

    const aggregatedResponse = options.aggregatedResponse;
    const infoType = options.infoType !== undefined ? options.infoType : 103;
    const devicetype = options.devicetype !== undefined ? options.devicetype : '103';
    const currentCommand = options.currentCommand !== undefined ? options.currentCommand : { valve_open: true };
    const notifications = options.notifications !== undefined ? options.notifications : [];

    const calls = {};
    const session = {
        getAllNotifications: async () => {
            calls.getAllNotifications = (calls.getAllNotifications || 0) + 1;
            return notifications;
        },
        getNotifications: async (pageSize, continuationToken) => {
            calls.getNotifications = { pageSize, continuationToken };
            return { text: JSON.stringify({ notifications: notifications, continuationToken: null, remainingNotifications: 0 }) };
        },
        markNotificationRead: async (notificationId, notification) => {
            calls.markNotificationRead = { notificationId, notification };
            return {};
        },
        markNotificationsRead: async (list) => {
            calls.markNotificationsRead = list;
            return {};
        },
        deleteNotification: async (notificationId) => {
            calls.deleteNotification = notificationId;
            return {};
        },
        deleteNotifications: async (notificationIds) => {
            calls.deleteNotifications = notificationIds;
            return {};
        },
        getApplianceInfo: async () => ({ text: JSON.stringify([{ type: infoType }]) }),
        getApplianceStatus: async () => ({ text: JSON.stringify([]) }),
        getApplianceDetails: async () => ({ text: JSON.stringify({}) }),
        getApplianceNotifications: async () => ({ text: JSON.stringify([]) }),
        getApplianceData: async (locationId, roomId, applianceId, fromDate, toDate, groupBy) => {
            calls.getApplianceData = { fromDate, toDate, groupBy };
            return { text: JSON.stringify(aggregatedResponse) };
        },
        getApplianceCommand: async () => ({ text: JSON.stringify({ command: currentCommand }) }),
        setApplianceCommand: async (locationId, roomId, applianceId, data) => {
            calls.setApplianceCommand = { locationId, roomId, applianceId, data };
            return {};
        },
        // Capture using the real builder so the actual posted body is asserted.
        sendApplianceCommand: async (locationId, roomId, applianceId, type, command, commandb64) => {
            const body = ondusApi.OndusSession.prototype.buildApplianceCommand.call(
                session, applianceId, type, command, commandb64);
            calls.sendApplianceCommand = { locationId, roomId, applianceId, type, command, commandb64, body };
            return {};
        },
    };

    const configNode = {
        connected: true,
        session: session,
        findAppliance: () => ({ ids: { locationId: 'l', roomId: 'r', applianceId: 'a' }, registrationComplete: true }),
        addListener: () => {},
        removeListener: () => {},
    };

    let ctor;
    const RED = {
        nodes: {
            registerType: (name, fn) => { ctor = fn; },
            createNode: (node) => {
                node.status = () => {};
                node.log = () => {};
                node.warn = () => {};
                node.error = () => {};
                node.send = () => {};
            },
            getNode: () => configNode,
        },
    };

    senseNodeModule(RED);

    const node = new EventEmitter();
    const errors = [];
    const warnings = [];
    const sent = [];

    ctor.call(node, { location: 'cfg', room: 'Wasserkeller', appliance: 'SenseGuard', devicetype: devicetype });

    // createNode set noop defaults; override to capture after construction.
    node.error = (message) => { errors.push(message); };
    node.warn = (message) => { warnings.push(message); };
    node.send = (messages) => { sent.push(messages); };

    return { node, calls, errors, warnings, sent };
}

async function runInput(harness, msg) {
    const handler = harness.node.listeners('input')[0];
    assert.ok(handler, 'input handler should be registered');
    await handler(msg);
}

describe('grohe sense node - aggregated data', function () {

    const aggregatedResponse = {
        appliance_id: 'uuid',
        type: 103,
        data: {
            group_by: 'HOUR',
            measurement: [
                { timestamp: '2026-06-01T10:00:00Z', flowrate: 0, pressure: 4.1, temperature_guard: 18.5 },
                { timestamp: '2026-06-01T11:00:00Z', flowrate: 0.2, pressure: 4.0, temperature_guard: 18.6 },
            ],
            withdrawals: [
                { starttime: '2026-06-01T10:00:00Z', stoptime: '2026-06-01T10:01:00Z', waterconsumption: 6.7, maxflowrate: 8.9 },
                { date: '2026-06-01', waterconsumption: 528.9, water_cost: 0.5, energy_cost: 0.2, hotwater_share: 0 },
            ],
        },
    };

    it('surfaces measurements and withdrawals as top-level arrays', async function () {
        const harness = buildHarness({ aggregatedResponse });
        await runInput(harness, { payload: { data: { from: '2026-06-01', to: '2026-06-28', groupBy: 'HOUR' } } });

        const payload = harness.sent[0][0].payload;
        assert.deepStrictEqual(payload.measurements, aggregatedResponse.data.measurement);
        assert.deepStrictEqual(payload.withdrawals, aggregatedResponse.data.withdrawals);
    });

    it('keeps the full raw inner content on msg.payload.data for backward compatibility', async function () {
        const harness = buildHarness({ aggregatedResponse });
        await runInput(harness, { payload: { data: { from: '2026-06-01', to: '2026-06-28', groupBy: 'HOUR' } } });

        const payload = harness.sent[0][0].payload;
        assert.deepStrictEqual(payload.data, aggregatedResponse.data);
    });

    it('handles both withdrawal shapes (per-event and per-period cost)', async function () {
        const harness = buildHarness({ aggregatedResponse });
        await runInput(harness, { payload: { data: { from: '2026-06-01', to: '2026-06-28', groupBy: 'DAY' } } });

        const withdrawals = harness.sent[0][0].payload.withdrawals;
        assert.ok('maxflowrate' in withdrawals[0]);
        assert.ok('water_cost' in withdrawals[1]);
    });

    it('defaults missing measurement / withdrawals arrays to []', async function () {
        const harness = buildHarness({ aggregatedResponse: { appliance_id: 'uuid', type: 103, data: { group_by: 'DAY' } } });
        await runInput(harness, { payload: { data: { from: '2026-06-01', to: '2026-06-28', groupBy: 'DAY' } } });

        const payload = harness.sent[0][0].payload;
        assert.deepStrictEqual(payload.measurements, []);
        assert.deepStrictEqual(payload.withdrawals, []);
    });

    it('normalizes an upper-case groupBy to lower case before calling the api', async function () {
        const harness = buildHarness({ aggregatedResponse });
        await runInput(harness, { payload: { data: { from: '2026-06-01', to: '2026-06-28', groupBy: 'HOUR' } } });

        assert.strictEqual(harness.calls.getApplianceData.groupBy, 'hour');
        assert.strictEqual(harness.errors.length, 0);
    });

    it('rejects an invalid groupBy and falls back to day without crashing the flow', async function () {
        const harness = buildHarness({ aggregatedResponse });
        await runInput(harness, { payload: { data: { from: '2026-06-01', to: '2026-06-28', groupBy: 'minute' } } });

        assert.strictEqual(harness.calls.getApplianceData.groupBy, 'day');
        assert.strictEqual(harness.errors.length, 1);
        assert.ok(/invalid groupBy/i.test(harness.errors[0]));
        // The flow still completed and produced output.
        assert.ok(harness.sent.length === 1);
    });

});

describe('grohe sense node - commands', function () {

    const aggregatedResponse = { appliance_id: 'uuid', type: 103, data: { group_by: 'day', measurement: [], withdrawals: [] } };

    it('sends a correct ApplianceCommand wrapper for valve_open', async function () {
        const harness = buildHarness({ aggregatedResponse });
        await runInput(harness, { payload: { command: { valve_open: true } } });

        assert.ok(harness.calls.sendApplianceCommand, 'sendApplianceCommand should be called');
        assert.deepStrictEqual(harness.calls.sendApplianceCommand.body, {
            appliance_id: 'a',
            type: 103,
            command: { valve_open: true },
        });
        assert.strictEqual(harness.errors.length, 0);
    });

    it('does not leak unrelated payload fields into the body (old bug fixed)', async function () {
        const harness = buildHarness({ aggregatedResponse });
        await runInput(harness, { payload: { command: { valve_open: true }, data: { from: 'x', to: 'y' }, debug: false } });

        const body = harness.calls.sendApplianceCommand.body;
        assert.deepStrictEqual(body.command, { valve_open: true });
        assert.ok(!('data' in body), 'data must not leak into the command body');
        assert.ok(!('debug' in body));
    });

    it('passes commandb64 through only when supplied', async function () {
        const harness = buildHarness({ aggregatedResponse });
        await runInput(harness, { payload: { command: { valve_open: true }, commandb64: 'Zm9v' } });
        assert.strictEqual(harness.calls.sendApplianceCommand.body.commandb64, 'Zm9v');
    });

    it('ignores unknown command keys (warns, still sends)', async function () {
        const harness = buildHarness({ aggregatedResponse });
        await runInput(harness, { payload: { command: { valve_open: true, hacker: 'x' } } });

        assert.deepStrictEqual(harness.calls.sendApplianceCommand.body.command, { valve_open: true });
        assert.ok(harness.warnings.some((w) => /unknown command field/i.test(w)));
        assert.strictEqual(harness.errors.length, 0);
    });

    it('rejects a bad value type without sending any command (no POST)', async function () {
        const harness = buildHarness({ aggregatedResponse });
        await runInput(harness, { payload: { command: { valve_open: 'yes please' } } });

        assert.strictEqual(harness.calls.sendApplianceCommand, undefined, 'no command should be sent');
        assert.strictEqual(harness.calls.setApplianceCommand, undefined);
        assert.strictEqual(harness.errors.length, 1);
        assert.ok(/valve_open must be a boolean/i.test(harness.errors[0]));
    });

    it('does not send a command for a non-Guard device', async function () {
        const harness = buildHarness({ aggregatedResponse, devicetype: '101', infoType: 101 });
        await runInput(harness, { payload: { command: { valve_open: true } } });

        assert.strictEqual(harness.calls.sendApplianceCommand, undefined);
        assert.strictEqual(harness.calls.setApplianceCommand, undefined);
    });

    it('merges the requested change onto the current command (full object sent)', async function () {
        const harness = buildHarness({
            aggregatedResponse,
            currentCommand: { valve_open: true, measure_now: false, pressure_measurement_running: false, buzzer_on: false, buzzer_sound_profile: 2, reason_for_change: 1 },
        });
        await runInput(harness, { payload: { command: { measure_now: true } } });

        // Only measure_now changes; all other current fields are preserved so the
        // api's full-object schema is satisfied.
        assert.deepStrictEqual(harness.calls.sendApplianceCommand.body.command, {
            valve_open: true,
            measure_now: true,
            pressure_measurement_running: false,
            buzzer_on: false,
            buzzer_sound_profile: 2,
            reason_for_change: 1,
        });
        assert.strictEqual(harness.errors.length, 0);
    });

    it('accepts the full documented command field set', async function () {
        const harness = buildHarness({ aggregatedResponse });
        const command = { valve_open: false, measure_now: true, pressure_measurement_running: false, buzzer_on: true, buzzer_sound_profile: 2 };
        await runInput(harness, { payload: { command: command } });

        assert.deepStrictEqual(harness.calls.sendApplianceCommand.body.command, command);
        assert.strictEqual(harness.errors.length, 0);
    });

});

describe('grohe sense node - notifications', function () {

    const aggregatedResponse = { appliance_id: 'uuid', type: 103, data: { group_by: 'day', measurement: [], withdrawals: [] } };
    const sample = [
        { notification_id: '1', appliance_id: 'a', is_read: false },
        { notification_id: '2', appliance_id: 'b', is_read: true },
        { notification_id: '3', appliance_id: 'a', is_read: false },
    ];

    it('lists all notifications filtered to the node appliance by default', async function () {
        const harness = buildHarness({ aggregatedResponse, notifications: sample });
        const msg = { payload: { notifications: true } };
        await runInput(harness, msg);

        // default appliance id is 'a' (from the mocked findAppliance)
        assert.deepStrictEqual(msg.payload.notifications.map((n) => n.notification_id), ['1', '3']);
        assert.strictEqual(harness.calls.getApplianceData, undefined, 'should not run the appliance poll');
    });

    it('lists all notifications for an explicit applianceId', async function () {
        const harness = buildHarness({ aggregatedResponse, notifications: sample });
        const msg = { payload: { notifications: true, applianceId: 'b' } };
        await runInput(harness, msg);
        assert.deepStrictEqual(msg.payload.notifications.map((n) => n.notification_id), ['2']);
    });

    it('returns a single page object for an object argument', async function () {
        const harness = buildHarness({ aggregatedResponse, notifications: sample });
        const msg = { payload: { notifications: { pageSize: 50 } } };
        await runInput(harness, msg);

        assert.strictEqual(harness.calls.getNotifications.pageSize, 50);
        assert.ok(Array.isArray(msg.payload.notifications.notifications));
        assert.ok('continuationToken' in msg.payload.notifications);
    });

    it('marks one notification read via PUT', async function () {
        const harness = buildHarness({ aggregatedResponse, notifications: sample });
        const msg = { payload: { markRead: 'n1' } };
        await runInput(harness, msg);
        assert.strictEqual(harness.calls.markNotificationRead.notificationId, 'n1');
        assert.deepStrictEqual(msg.payload.result, { markRead: 'n1' });
    });

    it('marks several notifications read via PATCH array', async function () {
        const harness = buildHarness({ aggregatedResponse, notifications: sample });
        await runInput(harness, { payload: { markRead: ['x', 'y'] } });
        assert.deepStrictEqual(harness.calls.markNotificationsRead, [
            { notification_id: 'x', is_read: true },
            { notification_id: 'y', is_read: true },
        ]);
    });

    it('marks all unread read', async function () {
        const harness = buildHarness({ aggregatedResponse, notifications: sample });
        const msg = { payload: { markAllRead: true } };
        await runInput(harness, msg);
        // ids 1 and 3 are unread
        assert.deepStrictEqual(harness.calls.markNotificationsRead, [
            { notification_id: '1', is_read: true },
            { notification_id: '3', is_read: true },
        ]);
        assert.deepStrictEqual(msg.payload.result, { markAllRead: 2 });
    });

    it('deletes one notification', async function () {
        const harness = buildHarness({ aggregatedResponse, notifications: sample });
        const msg = { payload: { deleteNotification: 'n9' } };
        await runInput(harness, msg);
        assert.strictEqual(harness.calls.deleteNotification, 'n9');
        assert.deepStrictEqual(msg.payload.result, { deleted: ['n9'] });
    });

    it('deletes several notifications', async function () {
        const harness = buildHarness({ aggregatedResponse, notifications: sample });
        await runInput(harness, { payload: { deleteNotifications: ['a', 'b'] } });
        assert.deepStrictEqual(harness.calls.deleteNotifications, ['a', 'b']);
    });

    it('rejects a malformed markRead without any HTTP call', async function () {
        const harness = buildHarness({ aggregatedResponse, notifications: sample });
        await runInput(harness, { payload: { markRead: 5 } });
        assert.strictEqual(harness.calls.markNotificationRead, undefined);
        assert.strictEqual(harness.calls.markNotificationsRead, undefined);
        assert.strictEqual(harness.errors.length, 1);
    });

    it('rejects a malformed deleteNotifications without any HTTP call', async function () {
        const harness = buildHarness({ aggregatedResponse, notifications: sample });
        await runInput(harness, { payload: { deleteNotifications: 'not-an-array' } });
        assert.strictEqual(harness.calls.deleteNotifications, undefined);
        assert.strictEqual(harness.errors.length, 1);
    });

});
