/**
 * Grohe Location configuration node.
 * Created by Karl-Heinz Wind
 */

'use strict';

const ondusApi = require('../lib/ondusApi.js');
const locator = require('../lib/locator.js');
const backoff = require('../lib/backoff.js');

const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 60000;

function describeError(exception) {
    if (exception === undefined || exception === null) {
        return 'unknown error';
    }
    if (exception.message) {
        return exception.message;
    }
    return String(exception);
}

module.exports = function (RED) {
    // The configuration node holds the username and password
    // and establishes the connection to the server.
    function GroheLocationNode(n) {
        RED.nodes.createNode(this, n);

        const node = this;
        node.config = n;
        // Trim so accidental leading / trailing whitespace does not silently
        // break the exact name match against the dashboard. (#25)
        node.locationName = (n.location || '').trim();
        node.connected = false;

        node.appliancesByRoomName = {};
        node.closing = false;
        node.reconnectTimer = undefined;
        node.reconnectAttempt = 0;

        const hasCredentials =
            node.credentials !== undefined &&
            node.credentials.username !== undefined &&
            node.credentials.username !== '' &&
            node.credentials.password !== undefined &&
            node.credentials.password !== '';

        // Tear down the current session (e.g. after the connection was lost). (#20)
        node.disconnect = function () {
            if (node.session && typeof node.session.stop === 'function') {
                ondusApi.logoff(node.session);
            }
            node.session = undefined;
            if (node.connected) {
                node.connected = false;
                node.emit('disconnected');
            }
        };

        // Schedule the next connection attempt with exponential backoff. (#20)
        node.scheduleReconnect = function () {
            if (node.closing) {
                return;
            }

            const delay = backoff.computeBackoffDelay(node.reconnectAttempt, RECONNECT_BASE_MS, RECONNECT_MAX_MS);
            node.reconnectAttempt++;
            node.log('Grohe: next connection attempt in ' + Math.round(delay / 1000) + 's.');

            node.reconnectTimer = setTimeout(function () {
                node.reconnectTimer = undefined;
                node.connect();
            }, delay);
        };

        // Called by the refresh timer when a scheduled token refresh fails,
        // e.g. because the internet connection was lost. (#20)
        node.onRefreshFailed = function (exception) {
            if (node.closing || !node.connected) {
                return;
            }
            node.warn('Grohe: token refresh failed (' + describeError(exception) + '), reconnecting...');
            node.disconnect();
            node.reconnectAttempt = 0; // recover quickly after a lost connection
            node.scheduleReconnect();
        };

        node.connect = async function () {
            if (node.closing) {
                return;
            }

            node.log('Grohe: connecting to the ondus cloud...');
            node.emit('connecting');

            let session;
            let dashboard;
            try {
                session = await ondusApi.login(
                    node.credentials.username,
                    node.credentials.password,
                    node.onRefreshFailed
                );

                const response = await session.getDahsboard();
                dashboard = JSON.parse(response.text);
            } catch (exception) {
                // Connectivity / authentication problem - keep retrying so the node
                // recovers automatically once the internet is back. (#20)
                node.connected = false;
                node.emit('initializeFailed', exception);
                node.emit('disconnected');
                node.warn('Grohe: connection failed: ' + describeError(exception) + '.');
                node.scheduleReconnect();
                return;
            }

            node.session = session;

            const locations = dashboard.locations || [];
            let foundLocation;
            for (let i = 0; i < locations.length; i++) {
                if (locations[i].name === node.locationName) {
                    foundLocation = locations[i];
                    break;
                }
            }

            if (foundLocation === undefined) {
                // Login worked but the configured location does not exist - this is a
                // configuration error, not a connectivity one, so do not spin the
                // retry loop. Surface it so the user can fix the name.
                node.disconnect();
                node.emit('initializeFailed', 'location "' + node.locationName + '" not found');
                node.emit('disconnected');
                node.warn(
                    'Grohe: location "' +
                        node.locationName +
                        '" not found in the account. Available locations: ' +
                        (locations
                            .map(function (l) {
                                return l.name;
                            })
                            .join(', ') || '(none)') +
                        '.'
                );
                return;
            }

            node.location = foundLocation;
            node.rooms = foundLocation.rooms || [];
            node.appliancesByRoomName = {};
            node.log('Grohe: location ' + foundLocation.name);

            for (let j = 0; j < node.rooms.length; j++) {
                const room = node.rooms[j];
                node.log('Grohe:     room ' + room.name);

                const appliances = room.appliances || [];
                node.appliancesByRoomName[room.name] = {
                    room: room,
                    appliances: appliances,
                };

                for (let k = 0; k < appliances.length; k++) {
                    node.log('Grohe:         appliance ' + appliances[k].name);
                }
            }

            node.reconnectAttempt = 0;
            node.connected = true;
            node.log('Grohe: connected.');
            node.emit('initialized');
            node.emit('connected');
        };

        if (hasCredentials) {
            node.connect();
        } else {
            // Defer so sense nodes (created after this config node) can subscribe first.
            setImmediate(function () {
                node.connected = false;
                node.emit('initializeFailed', 'credentials missing');
                node.emit('disconnected');
                node.warn('credentials missing');
            });
        }

        this.on('close', function (done) {
            node.closing = true;
            if (node.reconnectTimer !== undefined) {
                clearTimeout(node.reconnectTimer);
                node.reconnectTimer = undefined;
            }
            if (node.session && typeof node.session.stop === 'function') {
                ondusApi.logoff(node.session);
            }
            node.session = {};
            node.location = {};
            node.rooms = {};
            node.appliancesByRoomName = {};
            node.connected = false;
            done();
        });

        // Returns the full diagnostic lookup result (see lib/locator.js).
        this.findAppliance = function (roomName, applianceName) {
            return locator.findApplianceIds(node.location, node.appliancesByRoomName, roomName, applianceName);
        };

        // Back-compat: returns the ids object on success or undefined on failure.
        this.getApplianceIds = function (roomName, applianceName) {
            return node.findAppliance(roomName, applianceName).ids;
        };
    }

    RED.nodes.registerType('grohe location', GroheLocationNode, {
        credentials: {
            username: { type: 'text' },
            password: { type: 'password' },
        },
    });
};
