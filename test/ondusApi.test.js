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
