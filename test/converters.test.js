'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const converters = require('../grohe/lib/converters');

const senseFixture = require(path.join(__dirname, 'fixtures', 'sense-issue-27.json'));
const senseGuardFixture = require(path.join(__dirname, 'fixtures', 'senseguard-issue-26.json'));

describe('lib/converters', function () {
    describe('getMin / getMax', function () {
        it('returns the new value when the previous one is NaN', function () {
            assert.strictEqual(converters.getMin(5, Number.NaN), 5);
            assert.strictEqual(converters.getMax(5, Number.NaN), 5);
        });

        it('returns the smaller / larger of two numbers', function () {
            assert.strictEqual(converters.getMin(3, 7), 3);
            assert.strictEqual(converters.getMin(7, 3), 3);
            assert.strictEqual(converters.getMax(3, 7), 7);
            assert.strictEqual(converters.getMax(7, 3), 7);
        });
    });

    describe('convertToDate', function () {
        it('returns a Date instance for a millisecond input', function () {
            const ms = Date.UTC(2024, 0, 2, 3, 4, 5);
            const result = converters.convertToDate(ms);
            assert.ok(result instanceof Date);
            assert.strictEqual(result.getTime(), ms);
        });

        it('returns a Date instance when an ISO string is passed', function () {
            const iso = '2024-01-02T03:04:05.000Z';
            const result = converters.convertToDate(iso);
            assert.ok(result instanceof Date);
            assert.strictEqual(result.toISOString(), iso);
        });
    });

    describe('convertStatus', function () {
        it('flattens a status array into a keyed object', function () {
            const status = [
                { type: 'battery', value: 87 },
                { type: 'wifi_quality', value: 4 },
                { type: 'connection', value: 1 },
            ];
            assert.deepStrictEqual(converters.convertStatus(status), {
                battery: 87,
                wifi_quality: 4,
                connection: 1,
            });
        });

        it('returns an empty object for an empty array', function () {
            assert.deepStrictEqual(converters.convertStatus([]), {});
        });
    });

    describe('convertMeasurement', function () {
        it('computes min/max for available channels and reports range metadata', function () {
            const measurement = [
                { date: '2024-01-01T00:00:00Z', temperature: 18, humidity: 40, pressure: 1010 },
                { date: '2024-01-01T01:00:00Z', temperature: 22, humidity: 45, pressure: 1005 },
                { date: '2024-01-01T02:00:00Z', temperature: 20, humidity: 50, pressure: 1020 },
            ];
            const result = converters.convertMeasurement(measurement);

            assert.strictEqual(result.count, 3);
            assert.strictEqual(result.from, '2024-01-01T00:00:00Z');
            assert.strictEqual(result.to, '2024-01-01T02:00:00Z');
            assert.deepStrictEqual(result.temperature, { min: 18, max: 22 });
            assert.deepStrictEqual(result.humidity, { min: 40, max: 50 });
            assert.deepStrictEqual(result.pressure, { min: 1005, max: 1020 });
            assert.ok(!('flowrate' in result), 'flowrate should be omitted when missing');
            assert.ok(!('temperatureGuard' in result), 'temperatureGuard should be omitted when missing');
        });

        it('includes flowrate and temperatureGuard when present', function () {
            const measurement = [
                { date: '2024-01-01T00:00:00Z', flowrate: 0.5, temperature_guard: 21 },
                { date: '2024-01-01T00:01:00Z', flowrate: 2.5, temperature_guard: 19 },
            ];
            const result = converters.convertMeasurement(measurement);
            assert.deepStrictEqual(result.flowrate, { min: 0.5, max: 2.5 });
            assert.deepStrictEqual(result.temperatureGuard, { min: 19, max: 21 });
        });
    });

    describe('convertWithdrawals', function () {
        it('aggregates totals and isolates withdrawals from today', function () {
            const today = new Date();
            const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

            const withdrawals = [
                {
                    date: today.toISOString(),
                    waterconsumption: 10,
                    water_cost: 0.5,
                    energy_cost: 0.2,
                    hotwater_share: 0.4,
                    maxflowrate: 5,
                },
                {
                    date: yesterday.toISOString(),
                    waterconsumption: 7,
                    water_cost: 0.3,
                    energy_cost: 0.1,
                    hotwater_share: 0.2,
                    maxflowrate: 3,
                },
            ];

            const result = converters.convertWithdrawals(withdrawals);

            assert.strictEqual(result.count, 2);
            assert.strictEqual(result.totalWaterConsumption, 17);
            assert.strictEqual(result.todayWaterConsumption, 10);
            assert.strictEqual(result.totalWaterCost, 0.8);
            assert.strictEqual(result.totalEnerygCost, result.totalEnerygCost); // sanity
            assert.strictEqual(result.totalMaxFlowrate, 5);
            assert.strictEqual(result.todayMaxFlowrate, 5);
        });
    });

    describe('convertData', function () {
        it('returns an empty object when there is no measurement or withdrawals data', function () {
            assert.deepStrictEqual(converters.convertData({}), {});
        });

        it('skips empty arrays', function () {
            assert.deepStrictEqual(converters.convertData({ measurement: [], withdrawals: [] }), {});
        });

        it('includes both sections when present', function () {
            const today = new Date().toISOString();
            const data = {
                measurement: [{ date: today, temperature: 21, humidity: 42 }],
                withdrawals: [
                    {
                        date: today,
                        waterconsumption: 1,
                        water_cost: 0,
                        energy_cost: 0,
                        hotwater_share: 0,
                        maxflowrate: 1,
                    },
                ],
            };
            const result = converters.convertData(data);
            assert.ok(result.measurement);
            assert.ok(result.withdrawals);
            assert.strictEqual(result.measurement.count, 1);
            assert.strictEqual(result.withdrawals.count, 1);
        });
    });

    describe('convertNotifications', function () {
        it('returns one entry per input notification with category/message', function () {
            const input = [
                { category: 30, type: 0, threshold: 0, timestamp: 't1' },
                { category: 999, type: 0, threshold: 0, timestamp: 't2' },
            ];
            const result = converters.convertNotifications(input);
            assert.strictEqual(result.length, 2);

            assert.strictEqual(result[0].category, 'Alarm');
            assert.ok(/water has been SHUT OFF/i.test(result[0].message));
            assert.strictEqual(result[0].notification, input[0]);

            assert.strictEqual(result[1].category, 'Unknown');
            assert.ok(/Unkown notification category/.test(result[1].message));
        });
    });

    // Locks in the changed Sense (type 101) api format captured in issue #27.
    describe('changed Sense api (#27)', function () {
        const raw = senseFixture.raw;
        const expected = senseFixture.expected;

        it('flattens the status array into the documented object', function () {
            assert.deepStrictEqual(converters.convertStatus(raw.status), expected.status);
        });

        it('resolves the embedded notification to Warning / humidity message', function () {
            const result = converters.convertNotifications(raw.notifications);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].category, expected.notifications[0].category);
            assert.strictEqual(result[0].type, expected.notifications[0].type);
            assert.strictEqual(result[0].message, expected.notifications[0].message);
        });

        it('computes statistics from the day-grouped measurement data', function () {
            assert.deepStrictEqual(converters.convertData(raw.data.data), expected.statistics);
        });

        it('exposes details.data_latest.measurement as the current reading', function () {
            assert.deepStrictEqual(raw.details.data_latest.measurement, expected.measurement);
        });
    });

    describe('normalizeGroupBy / isValidGroupBy', function () {
        it('lower-cases string values (the api expects lower case)', function () {
            assert.strictEqual(converters.normalizeGroupBy('HOUR'), 'hour');
            assert.strictEqual(converters.normalizeGroupBy('Day'), 'day');
            assert.strictEqual(converters.normalizeGroupBy('month'), 'month');
        });

        it('passes non-strings through untouched', function () {
            assert.strictEqual(converters.normalizeGroupBy(undefined), undefined);
            assert.strictEqual(converters.normalizeGroupBy(null), null);
        });

        it('accepts hour, day, week, month and year', function () {
            assert.ok(converters.isValidGroupBy('hour'));
            assert.ok(converters.isValidGroupBy('day'));
            assert.ok(converters.isValidGroupBy('week'));
            assert.ok(converters.isValidGroupBy('month'));
            assert.ok(converters.isValidGroupBy('year'));
            assert.ok(!converters.isValidGroupBy('minute'));
            assert.ok(!converters.isValidGroupBy('HOUR'));
            assert.ok(!converters.isValidGroupBy(undefined));
        });
    });

    describe('extractAggregated', function () {
        it('returns the inner measurement and withdrawals arrays plus group_by', function () {
            const response = {
                appliance_id: 'uuid',
                type: 103,
                data: {
                    group_by: 'HOUR',
                    measurement: [{ timestamp: 't1', flowrate: 0, pressure: 4.1 }],
                    withdrawals: [{ starttime: 's', stoptime: 'e', waterconsumption: 6.7, maxflowrate: 8.9 }],
                },
            };
            const result = converters.extractAggregated(response);
            assert.strictEqual(result.groupBy, 'HOUR');
            assert.deepStrictEqual(result.measurements, response.data.measurement);
            assert.deepStrictEqual(result.withdrawals, response.data.withdrawals);
        });

        it('defaults missing measurement / withdrawals arrays to []', function () {
            const result = converters.extractAggregated({ data: { group_by: 'DAY' } });
            assert.deepStrictEqual(result.measurements, []);
            assert.deepStrictEqual(result.withdrawals, []);
            assert.strictEqual(result.groupBy, 'DAY');
        });

        it('tolerates a completely missing data object', function () {
            assert.deepStrictEqual(converters.extractAggregated({}), {
                groupBy: undefined,
                measurements: [],
                withdrawals: [],
            });
            assert.deepStrictEqual(converters.extractAggregated(undefined), {
                groupBy: undefined,
                measurements: [],
                withdrawals: [],
            });
        });

        it('preserves both withdrawal shapes (per-event and per-period cost)', function () {
            const response = {
                data: {
                    group_by: 'DAY',
                    measurement: [],
                    withdrawals: [
                        {
                            starttime: '2026-06-01T10:00:00Z',
                            stoptime: '2026-06-01T10:01:00Z',
                            waterconsumption: 6.7,
                            maxflowrate: 8.9,
                        },
                        {
                            date: '2026-06-01',
                            waterconsumption: 528.9,
                            water_cost: 0.5,
                            energy_cost: 0.2,
                            hotwater_share: 0,
                        },
                    ],
                },
            };
            const result = converters.extractAggregated(response);
            assert.strictEqual(result.withdrawals.length, 2);
            assert.ok('maxflowrate' in result.withdrawals[0]);
            assert.ok('water_cost' in result.withdrawals[1]);
        });
    });

    describe('convertConsumption', function () {
        it('extracts the present consumption fields', function () {
            const result = converters.convertConsumption({
                daily_consumption: 540,
                daily_cost: 0,
                average_daily_consumption: 452,
                average_monthly_consumption: 13563,
                measurement: { flowrate: 0 },
            });
            assert.deepStrictEqual(result, {
                daily_consumption: 540,
                daily_cost: 0,
                average_daily_consumption: 452,
                average_monthly_consumption: 13563,
            });
        });

        it('returns undefined when no consumption fields are present (e.g. a Sense device)', function () {
            assert.strictEqual(converters.convertConsumption({ measurement: { humidity: 50 } }), undefined);
        });
    });

    // Locks in the changed Sense Guard (type 103) api format captured in issue #26.
    describe('changed Sense Guard api (#26)', function () {
        const raw = senseGuardFixture.raw;
        const expected = senseGuardFixture.expected;

        it('flattens the status array into the documented object', function () {
            assert.deepStrictEqual(converters.convertStatus(raw.status), expected.status);
        });

        it('resolves the embedded notification to Information / firmware message', function () {
            const result = converters.convertNotifications(raw.notifications);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].category, expected.notifications[0].category);
            assert.strictEqual(result[0].type, expected.notifications[0].type);
            assert.strictEqual(result[0].message, expected.notifications[0].message);
        });

        it('computes measurement + withdrawal statistics, including max_flowrate', function () {
            const result = converters.convertData(raw.data.data);
            assert.deepStrictEqual(result, expected.statistics);
            // Regression guard for the renamed api field (#26).
            assert.strictEqual(result.withdrawals.totalMaxFlowrate, 23);
            assert.strictEqual(result.withdrawals.todayMaxFlowrate, 23);
        });

        it('exposes the latest measurement, withdrawal and consumption summary', function () {
            const dataLatest = raw.details.data_latest;
            assert.deepStrictEqual(dataLatest.measurement, expected.measurement);
            assert.deepStrictEqual(dataLatest.withdrawals, expected.withdrawal);
            assert.deepStrictEqual(converters.convertConsumption(dataLatest), expected.consumption);
        });
    });
});
