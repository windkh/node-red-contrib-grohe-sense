'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const locator = require('../grohe/lib/locator');

describe('lib/locator', function () {
    const location = { id: 'loc-1' };

    function makeAppliancesByRoomName() {
        return {
            Wasserkeller: {
                room: { id: 'room-1', name: 'Wasserkeller' },
                appliances: [
                    { appliance_id: 'app-1', name: 'SenseGuard', registration_complete: true },
                    { appliance_id: 'app-2', name: 'Ghost', registration_complete: false },
                    { appliance_id: 'app-3', name: 'NoFlag' },
                ],
            },
            WC: {
                room: { id: 'room-2', name: 'WC' },
                appliances: [{ appliance_id: 'app-4', name: 'Sense1', registration_complete: true }],
            },
        };
    }

    describe('findApplianceIds', function () {
        it('resolves ids for a matching room + appliance', function () {
            const result = locator.findApplianceIds(location, makeAppliancesByRoomName(), 'Wasserkeller', 'SenseGuard');
            assert.deepStrictEqual(result.ids, {
                locationId: 'loc-1',
                roomId: 'room-1',
                applianceId: 'app-1',
            });
            assert.strictEqual(result.registrationComplete, true);
            assert.ok(!('error' in result));
        });

        it('flags an appliance that is not fully registered', function () {
            const result = locator.findApplianceIds(location, makeAppliancesByRoomName(), 'Wasserkeller', 'Ghost');
            assert.strictEqual(result.ids.applianceId, 'app-2');
            assert.strictEqual(result.registrationComplete, false);
        });

        it('treats a missing registration_complete flag as registered', function () {
            const result = locator.findApplianceIds(location, makeAppliancesByRoomName(), 'Wasserkeller', 'NoFlag');
            assert.strictEqual(result.registrationComplete, true);
        });

        it('reports roomNotFound with the available room names', function () {
            const result = locator.findApplianceIds(location, makeAppliancesByRoomName(), 'Garage', 'SenseGuard');
            assert.strictEqual(result.error, 'roomNotFound');
            assert.deepStrictEqual(result.availableRooms, ['Wasserkeller', 'WC']);
            assert.ok(!('ids' in result));
        });

        it('reports applianceNotFound with the available appliance names', function () {
            const result = locator.findApplianceIds(
                location,
                makeAppliancesByRoomName(),
                'Wasserkeller',
                'IL MIO GUARD'
            );
            assert.strictEqual(result.error, 'applianceNotFound');
            assert.deepStrictEqual(result.availableRooms, ['Wasserkeller', 'WC']);
            assert.deepStrictEqual(result.availableAppliances, ['SenseGuard', 'Ghost', 'NoFlag']);
        });

        it('does not match names that differ only by surrounding whitespace', function () {
            const result = locator.findApplianceIds(
                location,
                makeAppliancesByRoomName(),
                'Wasserkeller',
                'SenseGuard '
            );
            assert.strictEqual(result.error, 'applianceNotFound');
        });

        it('handles an empty appliancesByRoomName without throwing', function () {
            const result = locator.findApplianceIds(location, {}, 'Wasserkeller', 'SenseGuard');
            assert.strictEqual(result.error, 'roomNotFound');
            assert.deepStrictEqual(result.availableRooms, []);
        });
    });
});
