'use strict';

const assert = require('assert');
const path = require('path');
const EventEmitter = require('events');

const senseNodeModule = require(path.join('..', 'grohe', 'nodes', 'grohe-sense-node'));

// Builds a GROHE Sense node instance wired to a mocked config node / session so the
// input handler can be exercised without any network access.
function buildHarness(options) {
    options = options || {};

    const aggregatedResponse = options.aggregatedResponse;
    const infoType = options.infoType !== undefined ? options.infoType : 103;

    const calls = {};
    const session = {
        getApplianceInfo: async () => ({ text: JSON.stringify([{ type: infoType }]) }),
        getApplianceStatus: async () => ({ text: JSON.stringify([]) }),
        getApplianceDetails: async () => ({ text: JSON.stringify({}) }),
        getApplianceNotifications: async () => ({ text: JSON.stringify([]) }),
        getApplianceData: async (locationId, roomId, applianceId, fromDate, toDate, groupBy) => {
            calls.getApplianceData = { fromDate, toDate, groupBy };
            return { text: JSON.stringify(aggregatedResponse) };
        },
        getApplianceCommand: async () => ({ text: JSON.stringify({ command: { valve_open: true } }) }),
        setApplianceCommand: async () => ({}),
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
    const sent = [];

    ctor.call(node, { location: 'cfg', room: 'Wasserkeller', appliance: 'SenseGuard', devicetype: '103' });

    // createNode set noop defaults; override to capture after construction.
    node.error = (message) => { errors.push(message); };
    node.send = (messages) => { sent.push(messages); };

    return { node, calls, errors, sent };
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
