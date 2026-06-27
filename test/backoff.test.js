'use strict';

const assert = require('assert');
const backoff = require('../grohe/lib/backoff');

describe('lib/backoff', function () {

    describe('computeBackoffDelay', function () {
        it('returns the base delay for the first attempt', function () {
            assert.strictEqual(backoff.computeBackoffDelay(0, 5000, 60000), 5000);
        });

        it('doubles the delay with each attempt', function () {
            assert.strictEqual(backoff.computeBackoffDelay(1, 5000, 60000), 10000);
            assert.strictEqual(backoff.computeBackoffDelay(2, 5000, 60000), 20000);
            assert.strictEqual(backoff.computeBackoffDelay(3, 5000, 60000), 40000);
        });

        it('caps the delay at maxMs', function () {
            assert.strictEqual(backoff.computeBackoffDelay(4, 5000, 60000), 60000);
            assert.strictEqual(backoff.computeBackoffDelay(100, 5000, 60000), 60000);
        });

        it('normalizes negative / NaN attempts to the base delay', function () {
            assert.strictEqual(backoff.computeBackoffDelay(-1, 5000, 60000), 5000);
            assert.strictEqual(backoff.computeBackoffDelay(NaN, 5000, 60000), 5000);
        });
    });

});
