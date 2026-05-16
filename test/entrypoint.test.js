'use strict';

const assert = require('assert');
const path = require('path');

describe('grohe/99-grohe.js entry point', function () {

    it('registers both grohe nodes against a stubbed RED runtime', function () {
        const registered = [];
        const RED = {
            log: { info: () => {} },
            nodes: {
                registerType: (name) => registered.push(name),
                createNode: () => {},
                getNode: () => undefined,
            },
        };

        const entry = require(path.join('..', 'grohe', '99-grohe.js'));
        entry(RED);

        assert.ok(registered.includes('grohe location'), 'grohe location should be registered');
        assert.ok(registered.includes('grohe sense'), 'grohe sense should be registered');
    });

});
