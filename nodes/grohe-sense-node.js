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

            node.locationId = node.config.locationId;

            node.status({ fill: 'red', shape: 'ring', text: 'initializing' });

            node.onInitialized = function () {

                node.applianceIds = node.config.getApplianceIds(node.roomName, node.applianceName);
                if (node.applianceIds !== undefined) {
                    node.status({ fill: 'green', shape: 'ring', text: 'connected' });

                    node.on('input', async function (msg) {

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
                }
                else {
                    node.status({ fill: 'red', shape: 'ring', text: node.applianceName + ' not found ' });
                }

            };
            node.config.addListener('initialized', node.onInitialized);

            node.onError = function (errorMessage) {
                node.status({ fill: 'red', shape: 'ring', text: errorMessage });
            };
            node.config.addListener('initializeFailed', node.onError);

            this.on('close', function () {
                if (node.onInitialized) {
                    node.config.removeListener('initialized', node.onInitialized);
                }

                if (node.onError) {
                    node.config.removeListener('initializeFailed', node.onError);
                }

                node.status({});
            });
        }
        else {
            node.status({ fill: 'red', shape: 'ring', text: 'no config' });
        }
    }

    RED.nodes.registerType('grohe sense', GroheSenseNode);
};
