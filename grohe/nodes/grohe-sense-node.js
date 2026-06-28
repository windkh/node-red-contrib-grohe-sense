/**
 * Grohe Sense node.
 * Reads status / details / notifications and (for Sense Guard) sends commands.
 * Created by Karl-Heinz Wind
 */

'use strict';

const ondusApi = require('../lib/ondusApi.js');
const converters = require('../lib/converters.js');

// Superagent only puts the HTTP status text (e.g. "Bad Request") in error.message.
// The server usually explains the real reason in the response body, so append it.
function httpErrorDetail(exception) {
    let response = exception && exception.response;
    if (response) {
        if (response.text) {
            return response.text;
        }
        if (response.body && Object.keys(response.body).length > 0) {
            return JSON.stringify(response.body);
        }
    }
    return '';
}

function describeHttpError(prefix, exception) {
    let detail = httpErrorDetail(exception);
    return prefix + ': ' + exception.message + (detail ? ' - ' + detail : '');
}

// Expected value type per appliance command field. (full command set)
const COMMAND_FIELD_TYPES = {
    valve_open: 'boolean',
    measure_now: 'boolean',
    get_current_measurement: 'boolean',
    buzzer_on: 'boolean',
    buzzer_sound_profile: 'number',
    cleaning_mode: 'boolean',
    co2_status_reset: 'boolean',
    filter_status_reset: 'boolean',
    temp_user_unlock_on: 'boolean',
    pressure_measurement_running: 'boolean',
    reason_for_change: 'number',
};

// Splits a command object into unknown keys (to ignore) and type errors (to reject).
function validateCommand(command) {
    let ignored = [];
    let typeErrors = [];

    for (let key of Object.keys(command)) {
        let expected = COMMAND_FIELD_TYPES[key];
        if (expected === undefined) {
            ignored.push(key);
        }
        else if (typeof command[key] !== expected) {
            typeErrors.push(key + ' must be a ' + expected);
        }
    }

    return { ignored: ignored, typeErrors: typeErrors };
}

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

                    // Account-wide notification operations (not gated on device type).
                    // Each is a dedicated request: perform it, enrich msg.payload and return. (notifications)
                    let session = node.config.session;

                    if (msg.payload !== undefined && msg.payload.notifications !== undefined) {
                        if (msg.payload.notifications === true) {
                            let all = await session.getAllNotifications();
                            let applianceId = msg.payload.applianceId !== undefined ? msg.payload.applianceId : node.applianceIds.applianceId;
                            if (applianceId) {
                                all = all.filter(function (n) { return n.appliance_id === applianceId; });
                            }
                            msg.payload.notifications = all;
                            node.send([msg]);
                            node.status({ fill: 'green', shape: 'ring', text: all.length + ' notifications' });
                            return;
                        }
                        else if (typeof msg.payload.notifications === 'object') {
                            let page = msg.payload.notifications;
                            let response = await session.getNotifications(page.pageSize, page.continuationToken);
                            msg.payload.notifications = JSON.parse(response.text);
                            node.send([msg]);
                            node.status({ fill: 'green', shape: 'ring', text: 'ok' });
                            return;
                        }
                        else {
                            node.error('Grohe Sense: msg.payload.notifications must be true or an object { pageSize, continuationToken }.', msg);
                            node.status({ fill: 'red', shape: 'ring', text: 'failed' });
                            return;
                        }
                    }

                    if (msg.payload !== undefined && msg.payload.markRead !== undefined) {
                        let markRead = msg.payload.markRead;
                        if (typeof markRead === 'string') {
                            await session.markNotificationRead(markRead);
                        }
                        else if (Array.isArray(markRead)) {
                            await session.markNotificationsRead(markRead.map(function (id) { return { notification_id: id, is_read: true }; }));
                        }
                        else {
                            node.error('Grohe Sense: msg.payload.markRead must be a notification id (string) or an array of ids.', msg);
                            node.status({ fill: 'red', shape: 'ring', text: 'failed' });
                            return;
                        }
                        msg.payload.result = { markRead: markRead };
                        node.send([msg]);
                        node.status({ fill: 'green', shape: 'ring', text: 'ok' });
                        return;
                    }

                    if (msg.payload !== undefined && msg.payload.markAllRead === true) {
                        let all = await session.getAllNotifications();
                        let unread = all.filter(function (n) { return n.is_read === false; });
                        if (unread.length > 0) {
                            await session.markNotificationsRead(unread.map(function (n) { return { notification_id: n.notification_id, is_read: true }; }));
                        }
                        msg.payload.result = { markAllRead: unread.length };
                        node.send([msg]);
                        node.status({ fill: 'green', shape: 'ring', text: 'ok' });
                        return;
                    }

                    if (msg.payload !== undefined && msg.payload.deleteNotification !== undefined) {
                        let id = msg.payload.deleteNotification;
                        if (typeof id !== 'string') {
                            node.error('Grohe Sense: msg.payload.deleteNotification must be a notification id (string).', msg);
                            node.status({ fill: 'red', shape: 'ring', text: 'failed' });
                            return;
                        }
                        await session.deleteNotification(id);
                        msg.payload.result = { deleted: [id] };
                        node.send([msg]);
                        node.status({ fill: 'green', shape: 'ring', text: 'ok' });
                        return;
                    }

                    if (msg.payload !== undefined && msg.payload.deleteNotifications !== undefined) {
                        let idsToDelete = msg.payload.deleteNotifications;
                        if (!Array.isArray(idsToDelete)) {
                            node.error('Grohe Sense: msg.payload.deleteNotifications must be an array of notification ids.', msg);
                            node.status({ fill: 'red', shape: 'ring', text: 'failed' });
                            return;
                        }
                        await session.deleteNotifications(idsToDelete);
                        msg.payload.result = { deleted: idsToDelete };
                        node.send([msg]);
                        node.status({ fill: 'green', shape: 'ring', text: 'ok' });
                        return;
                    }

                    if (node.devicetype === ondusApi.OndusType.SenseGuard) {
                        if (msg.payload !== undefined && msg.payload.command !== undefined) {
                            let command = msg.payload.command;
                            let validation = validateCommand(command);

                            if (validation.typeErrors.length > 0) {
                                node.error('Grohe Sense: invalid command field(s): ' + validation.typeErrors.join('; ') + '. Command not sent.', msg);
                            }
                            else {
                                if (validation.ignored.length > 0) {
                                    node.warn('Grohe Sense: ignoring unknown command field(s): ' + validation.ignored.join(', ') + '.');
                                }

                                // The api validates the whole command object (anyOf / select
                                // schema) and requires the full field set, not just the changed
                                // field. So read the current command and merge the requested
                                // changes onto it before sending the complete object.
                                let currentCommand = {};
                                try {
                                    let currentResponse = await node.config.session.getApplianceCommand(
                                        node.applianceIds.locationId,
                                        node.applianceIds.roomId,
                                        node.applianceIds.applianceId);
                                    let parsedCurrent = JSON.parse(currentResponse.text);
                                    if (parsedCurrent != null && parsedCurrent.command != null) {
                                        currentCommand = parsedCurrent.command;
                                    }
                                }
                                catch (exception) {
                                    node.warn(describeHttpError('Grohe Sense: could not read current command, sending only the requested fields', exception));
                                }

                                let mergedCommand = Object.assign({}, currentCommand, command);

                                // Build a correct ApplianceCommand wrapper (appliance_id, type,
                                // whitelisted command) instead of posting the whole payload. (full command set)
                                await node.config.session.sendApplianceCommand(
                                    node.applianceIds.locationId,
                                    node.applianceIds.roomId,
                                    node.applianceIds.applianceId,
                                    node.devicetype,
                                    mergedCommand,
                                    msg.payload.commandb64);
                                // Hint: response is not used right now.
                            }
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

                        // groupBy is restricted to hour | day | week | month | year (hour =
                        // finest) and the api expects it in lower case. Accept any casing on
                        // input; reject anything else without failing the flow.
                        let groupBy = msg.payload.data.groupBy;
                        if (groupBy !== undefined) {
                            let normalized = converters.normalizeGroupBy(groupBy);
                            if (converters.isValidGroupBy(normalized)) {
                                groupBy = normalized;
                            }
                            else {
                                node.error('Grohe Sense: invalid groupBy "' + groupBy + '" - expected hour, day, week, month or year. Falling back to day.', msg);
                                groupBy = 'day';
                            }
                        }

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
                            let errorMessage = describeHttpError('getApplianceData failed', exception);
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
                        result.data = data.data; // full raw inner content, kept for backward compatibility
                        result.statistics = converters.convertData(data.data);

                        // Surface the two useful arrays of the aggregated response as
                        // clean top-level arrays (default [] when absent). (aggregated data)
                        let aggregated = converters.extractAggregated(data);
                        result.measurements = aggregated.measurements;
                        result.withdrawals = aggregated.withdrawals;
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
                    let errorMessage = describeHttpError('Caught exception', exception);
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
