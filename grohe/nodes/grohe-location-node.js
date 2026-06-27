/**
 * Grohe Location configuration node.
 * Created by Karl-Heinz Wind
 */

'use strict';

const ondusApi = require('../lib/ondusApi.js');
const locator = require('../lib/locator.js');

module.exports = function (RED) {
    // The configuration node holds the username and password
    // and establishes the connection to the server.
    function GroheLocationNode(n) {
        RED.nodes.createNode(this, n);

        let node = this;
        node.config = n;
        // Trim so accidental leading / trailing whitespace does not silently
        // break the exact name match against the dashboard. (#25)
        node.locationName = (n.location || '').trim();
        node.connected = false;

        node.appliancesByRoomName = {};

        if (node.credentials !== undefined && node.credentials.username !== undefined && node.credentials.password !== undefined
            && node.credentials.username !== '' && node.credentials.password !== '') {

            (async () => {

                try {
                    node.session = await ondusApi.login(node.credentials.username, node.credentials.password);

                    let response = await node.session.getDahsboard();
                    let dashboard = JSON.parse(response.text);

                    let locations = dashboard.locations;

                    for (let i = 0; i < locations.length; i++) {
                        let location = locations[i];

                        if (location.name === node.locationName) {
                            node.location = location;
                            node.log('location ' + location.name);

                            node.rooms = location.rooms;

                            for (let j = 0; j < node.rooms.length; j++) {
                                let room = node.rooms[j];
                                node.log('    room ' + room.name);

                                let appliances = room.appliances;
                                node.appliancesByRoomName[room.name] = {
                                    room: room,
                                    appliances: appliances,
                                };

                                for (let k = 0; k < appliances.length; k++) {
                                    let appliance = appliances[k];
                                    node.log('        appliance ' + appliance.name);
                                }
                            }

                            node.connected = true;
                            node.emit('initialized');
                            break;
                        }
                    }
                }
                catch (exception) {
                    node.connected = false;
                    node.emit('initializeFailed', exception);
                    node.warn(exception);
                }
            })();
        }
        else {
            node.connected = false;
            node.emit('initializeFailed', 'credentials missing');
            node.warn('credentials missing');
        }

        this.on('close', function (done) {
            ondusApi.logoff(node.session);
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
