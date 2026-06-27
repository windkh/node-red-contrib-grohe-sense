/**
 * Grohe Sense node.
 * Reads status / details / notifications and (for Sense Guard) sends commands.
 * Created by Karl-Heinz Wind
 */

'use strict';

const ondusApi = require('../lib/ondusApi.js');
const converters = require('../lib/converters.js');

module.exports = function (RED) {
    function GroheSenseNode(config) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.location = config.location;
        node.roomName = config.room.trim();
        node.applianceName = config.appliance.trim();
        node.devicetype = Number(config.devicetype);

        node.config = RED.nodes.getNode(node.location);
        if (node.config) {

            node.applianceIds = undefined;

            node.status({ fill: 'red', shape: 'ring', text: 'connecting' });

            // (Re)resolve the appliance whenever the config node (re)connects. (#20, #25)
            node.resolveAppliance = function () {
                let lookup = node.config.findAppliance(node.roomName, node.applianceName);
                node.applianceIds = lookup.ids;
                if (node.applianceIds !== undefined) {
                    node.status({ fill: 'green', shape: 'ring', text: 'connected' });

                    // A stale / not fully registered appliance resolves but its
                    // commands typically time out - warn so the cause is obvious. (#25)
                    if (lookup.registrationComplete === false) {
                        node.warn('Grohe appliance "' + node.applianceName + '" is not fully registered in the Grohe app - commands (e.g. open / close valve) may time out.');
                    }
                }
                else {
                    // Tell the user what is actually available instead of leaving
                    // them to guess at a name mismatch. (#25)
                    let hint;
                    if (lookup.error === 'roomNotFound') {
                        hint = 'room "' + node.roomName + '" not found. Available rooms: ' +
                            (lookup.availableRooms.join(', ') || '(none)');
                    }
                    else {
                        hint = 'appliance "' + node.applianceName + '" not found in room "' + node.roomName +
                            '". Available appliances: ' + (lookup.availableAppliances.join(', ') || '(none)');
                    }
                    node.warn('Grohe Sense: ' + hint + '. Names must match the Grohe app exactly (including spaces and capitalization).');
                    node.status({ fill: 'red', shape: 'ring', text: node.applianceName + ' not found' });
                }
            };

            node.onConnected = function () {
                node.resolveAppliance();
            };

            node.onDisconnected = function () {
                node.applianceIds = undefined;
                node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
            };

            node.onError = function (errorMessage) {
                node.applianceIds = undefined;
                node.status({ fill: 'red', shape: 'ring', text: typeof errorMessage === 'string' ? errorMessage : 'disconnected' });
            };

            node.config.addListener('connected', node.onConnected);
            node.config.addListener('disconnected', node.onDisconnected);
            node.config.addListener('initializeFailed', node.onError);

            // The config node may already be connected (e.g. on a partial redeploy).
            if (node.config.connected) {
                node.resolveAppliance();
            }

            node.on('input', async function (msg) {

                if (node.applianceIds === undefined) {
                    node.warn('Grohe Sense: not connected (or appliance not resolved) - ignoring input.');
                    return;
                }

                try {
                    node.status({ fill: 'green', shape: 'ring', text: 'updating...' });

                    if (node.devicetype === ondusApi.OndusType.SenseGuard) {
                        if (msg.payload !== undefined && msg.payload.command !== undefined) {
                            let data = msg.payload;
                            data.type = node.devicetype;
                            await node.config.session.setApplianceCommand(
                                node.applianceIds.locationId,
                                node.applianceIds.roomId,
                                node.applianceIds.applianceId,
                                data);
                            // Hint: response is not used right now.
                        }
                    }

                    let responseInfo = await node.config.session.getApplianceInfo(
                        node.applianceIds.locationId,
                        node.applianceIds.roomId,
                        node.applianceIds.applianceId);
                    let info = JSON.parse(responseInfo.text);

                    let responseStatus = await node.config.session.getApplianceStatus(
                        node.applianceIds.locationId,
                        node.applianceIds.roomId,
                        node.applianceIds.applianceId);
                    let status = JSON.parse(responseStatus.text);

                    let responseDetails = await node.config.session.getApplianceDetails(
                        node.applianceIds.locationId,
                        node.applianceIds.roomId,
                        node.applianceIds.applianceId);
                    let details = JSON.parse(responseDetails.text);

                    let responseNotifications = await node.config.session.getApplianceNotifications(
                        node.applianceIds.locationId,
                        node.applianceIds.roomId,
                        node.applianceIds.applianceId);
                    let notifications = JSON.parse(responseNotifications.text);

                    let data;
                    if (msg.payload !== undefined && msg.payload.data !== undefined) {
                        let fromDate = converters.convertToDate(msg.payload.data.from);
                        let toDate = converters.convertToDate(msg.payload.data.to);
                        let groupBy = msg.payload.data.groupBy;
                        try {
                            let responseData = await node.config.session.getApplianceData(
                                node.applianceIds.locationId,
                                node.applianceIds.roomId,
                                node.applianceIds.applianceId,
                                fromDate,
                                toDate,
                                groupBy);
                            data = JSON.parse(responseData.text);
                        }
                        catch (exception) {
                            let errorMessage = 'getApplianceData failed: ' + exception.message;
                            node.error(errorMessage, msg);
                            node.status({ fill: 'red', shape: 'ring', text: 'failed' });
                        }
                    }

                    // For Debugging only
                    if (msg.debug === true) {
                        let debugMsg = {
                            debug: {
                                applianceIds: node.applianceIds,
                                info: info,
                                status: status,
                                details: details,
                                notifications: notifications,
                                applianceData: data,
                            },
                        };
                        node.warn(debugMsg);
                    }

                    let result = {};

                    if (info != null) {
                        result.info = info;
                    }

                    if (status != null) {
                        result.status = converters.convertStatus(status);
                    }

                    if (details != null) {
                        result.details = details;

                        // The changed api exposes the most recent reading directly
                        // in details.data_latest. Surface its parts as first-class
                        // fields so the current measurement / latest withdrawal /
                        // consumption summary is available without requesting
                        // historical data. (#27, #26)
                        let dataLatest = details.data_latest;
                        if (dataLatest != null) {
                            if (dataLatest.measurement != null) {
                                result.measurement = dataLatest.measurement;
                            }

                            // Sense Guard only: latest withdrawal + consumption summary.
                            if (dataLatest.withdrawals != null) {
                                result.withdrawal = dataLatest.withdrawals;
                            }

                            let consumption = converters.convertConsumption(dataLatest);
                            if (consumption != null) {
                                result.consumption = consumption;
                            }
                        }
                    }

                    if (notifications != null) {
                        result.notifications = converters.convertNotifications(notifications);
                    }

                    if (data != null) {
                        result.data = data.data;
                        result.statistics = converters.convertData(data.data);
                    }

                    if (info[0].type === ondusApi.OndusType.SenseGuard) {
                        let response4 = await node.config.session.getApplianceCommand(
                            node.applianceIds.locationId,
                            node.applianceIds.roomId,
                            node.applianceIds.applianceId);
                        let command = JSON.parse(response4.text);
                        result.command = command.command;
                        // Here timestamp could also be interesting in future.
                    }

                    msg.payload = result;
                    node.send([msg]);

                    let notificationCount = 0;
                    if (notifications !== undefined) {
                        notificationCount = notifications.length;
                    }

                    if (notificationCount === 0) {
                        node.status({ fill: 'green', shape: 'ring', text: 'ok' });
                    }
                    else {
                        node.status({ fill: 'yellow', shape: 'dot', text: notificationCount + ' notifications' });
                    }
                }
                catch (exception) {
                    let errorMessage = 'Caught exception: ' + exception.message;
                    node.error(errorMessage, msg);
                    node.status({ fill: 'red', shape: 'ring', text: 'failed' });
                }
            });

            this.on('close', function () {
                node.config.removeListener('connected', node.onConnected);
                node.config.removeListener('disconnected', node.onDisconnected);
                node.config.removeListener('initializeFailed', node.onError);
                node.status({});
            });
        }
        else {
            node.status({ fill: 'red', shape: 'ring', text: 'no config' });
        }
    }

    RED.nodes.registerType('grohe sense', GroheSenseNode);
};
