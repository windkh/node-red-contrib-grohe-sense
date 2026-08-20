'use strict';
// Flat ESLint config — standard for windkh node-red node repos (ESLint >= 10).
// Verified unchanged against the full v10 stack: eslint@10, @eslint/js@10,
// eslint-config-prettier@10, globals@17.
const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
    {
        // c8 writes coverage/ on every `npm run coverage`, and linting generated output is
        // noise at best. A repo adds its own ignores here (vendored code, device scripts that
        // do not run on Node); keep those in the same block rather than a second one.
        ignores: ['coverage/**'],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            // Avoid `var`; prefer `const` (or `let` when reassigned).
            'no-var': 'error',
            'prefer-const': 'warn',
            // Keep one statement per line for readability.
            'max-statements-per-line': ['warn', { max: 1 }],
        },
    },
    prettier,
];
