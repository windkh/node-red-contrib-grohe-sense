// Note that the code is derived from the great work of the authors of the following projects:
// https://github.com/FlorianSW/grohe-ondus-api-java/issues/3
// https://github.com/faune/homebridge-grohe-sense

'use strict';

const he = require('he');
const superagent = require('superagent');

const baseUrl = 'https://idp2-apigw.cloud.grohe.com';
const apiUrl = baseUrl + '/v3/iot';
const loginUrl = apiUrl + '/oidc/login';
const refreshUrl = apiUrl + '/oidc/refresh';

const actionPattern = 'action="([^"]*)"';
const actionPrefix = 'action=';

// Allowed command keys (snake_case) of the ApplianceCommand.command object.
// Used to validate / whitelist caller input before sending. (full command set)
const COMMAND_KEYS = [
    'valve_open',
    'measure_now',
    'get_current_measurement',
    'buzzer_on',
    'buzzer_sound_profile',
    'cleaning_mode',
    'co2_status_reset',
    'filter_status_reset',
    'temp_user_unlock_on',
    'pressure_measurement_running',
    'reason_for_change',
];

class OndusSession {
    constructor() {
        // A session contains the following properties:
        // let session = {
        //     actionUrl : '',
        //     tokenUrl : '',
        //     refreshToken : '',
        //     refreshTokenExpiresIn : '',
        //     accessToken : '',
        //     accessTokenExpiresIn : '',
        //     cookie : '',
        //     refreshTimer : ''
        // };
    }

    // GET https://idp2-apigw.cloud.grohe.com/v3/iot/oidc/login
    // Status 200
    //   2 Cookies are set for idp2-apigw.cloud.grohe.com/
    //   - AWSALB
    //   - AWSALBCORS
    //   2 Cookies are set for idp2-apigw.cloud.grohe.com/v1/sso/auth/realms/idm-apigw/
    //   - AUTH_SESSION_ID
    //   - KC_RESTART
    // --> content is a webpage with a login form containing action="https://..."
    // --> login with this actionUrl
    //
    // Status 302 (Found = already logged in)
    //   2 Cookies are set for idp2-apigw.cloud.grohe.com/
    //   - AWSALB
    //   - AWSALBCORS
    // --> response.headers.Location =
    //
    // GET https://idp2-apigw.cloud.grohe.com/v1/sso/auth/realms/idm-apigw/protocol/openid-connect/auth?redirect_uri=ondus://idp2-apigw.cloud.grohe.com/v3/iot/oidc/token...)
    // Status 200 (OK)
    //   2 Cookies are set for idp2-apigw.cloud.grohe.com/v1/sso/auth/realms/idm-apigw/
    //   - AUTH_SESSION_ID
    //   - KC_RESTART
    getActionUrl(_username, _password) {
        const session = this;
        return new Promise(function (resolve, reject) {
            superagent.get(loginUrl).end((error, response) => {
                if (error) {
                    reject(error);
                } else {
                    if (response.status === 200) {
                        const page = response.text;

                        const regEx = new RegExp(actionPattern);
                        const match = regEx.exec(page);
                        if (match !== null) {
                            const actionUrlText = match[0].replace(actionPrefix, '');
                            const encodedActionUrl = actionUrlText.substring(1, actionUrlText.length - 1);

                            session.actionUrl = he.decode(encodedActionUrl);
                            session.cookie = response.header['set-cookie'];
                            resolve(response);
                        } else {
                            reject('action not found in webform.');
                        }
                    } else if (response.status === 302) {
                        // TODO: not tested!!!
                        session.cookie = response.header['set-cookie'];
                        session.tokenUrl = response.header.Location;
                        resolve(response);
                    } else {
                        reject('Failed to get response from ' + loginUrl);
                    }
                }
            });
        });
    }

    // POST https://idp2-apigw.cloud.grohe.com/v1/sso/auth/realms/idm-apigw/login-actions/authenticate
    //      ?session_code=...
    //      &execution=
    //      &client_id=iot
    //      &tab_id=...
    //      Body: username password (url encoded)
    //
    // Status 302 (Found) = success
    //     Cookies are set for /v1/sso/auth/realms/idm-apigw/
    //     AWSELB
    //     AUTH_SESSION_ID
    //     KEYCLOAK_LOCALE
    //     KEYCLOAK_IDENTITY
    //     KEYCLOAK_IDENTITY_LEGACY
    //     KEYCLOAK_SESSION
    //     KEYCLOAK_SESSION_LEGACY
    //
    //     continue with response.Headers.Location (ondus must be replaced with https)
    //     GET https://idp2-apigw.cloud.grohe.com/v3/iot/oidc/token
    //         ?state=...
    //         &session_state=...
    //         &code=...
    //     Status 200 (OK) --> "access_token" =
    //
    // Status 200 (OK) = no sccuess
    getTokenUrl(username, password) {
        const session = this;
        return new Promise(function (resolve, reject) {
            const form = new URLSearchParams();
            form.set('username', username);
            form.set('password', password);

            const content = form.toString();

            superagent
                .post(session.actionUrl)
                .set('Cookie', session.cookie)
                .set('Content-Type', 'application/x-www-form-urlencoded')
                .send(content)
                .buffer(false)
                .redirects(0)
                .end((error, response) => {
                    // Note that error can be true when status is 302 which means Found and is a success.
                    if (response && response.header.location) {
                        session.tokenUrl = response.header.location.replace('ondus://', 'https://');
                        resolve(response);
                    } else {
                        reject('Login for user ' + username + ' into grohe cloud failed:/n' + error);
                    }
                });
        });
    }

    getRefreshToken() {
        const session = this;
        return new Promise(function (resolve, reject) {
            superagent
                .get(session.tokenUrl)
                .set('Cookie', session.cookie)
                .end((error, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        if (response.body.access_token && response.body.refresh_token) {
                            session.accessToken = response.body.access_token;
                            session.accessTokenExpiresIn = response.body.expires_in;
                            session.refreshToken = response.body.refresh_token;
                            session.refreshTokenExpiresIn = response.body.refresh_expires_in;
                            resolve(response);
                        } else {
                            reject('getRefreshToken failed to get token.');
                        }
                    }
                });
        });
    }

    refreshAccessToken() {
        const session = this;
        return new Promise(function (resolve, reject) {
            superagent
                .post(refreshUrl)
                .set('Content-Type', 'application/json')
                .set('accept', 'json')
                .send({ refresh_token: session.refreshToken })
                .end((error, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        if (response.body.access_token && response.body.expires_in) {
                            session.accessToken = response.body.access_token;
                            session.accessTokenExpiresIn = response.body.expires_in;
                            resolve(response);
                        } else {
                            reject('Failed to refresh access token');
                        }
                    }
                });
        });
    }

    // onError (optional) is invoked when a scheduled token refresh fails, e.g.
    // because the internet connection was lost. This lets the caller tear the
    // session down and re-enter its reconnect loop instead of silently dying. (#20)
    start(onError) {
        const session = this;

        const interval = (1000 * session.accessTokenExpiresIn) / 2; // 1800s
        session.refreshTimer = setInterval(function () {
            session.refreshAccessToken().catch(function (error) {
                if (typeof onError === 'function') {
                    onError(error);
                }
            });
        }, interval);
    }

    stop() {
        const session = this;

        clearInterval(session.refreshTimer);
    }

    get(url) {
        const session = this;
        return new Promise(function (resolve, reject) {
            superagent
                .get(url)
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + session.accessToken)
                .set('accept', 'json')
                .end((error, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                });
        });
    }

    post(url, data) {
        const session = this;
        return new Promise(function (resolve, reject) {
            superagent
                .post(url)
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + session.accessToken)
                .set('accept', 'json')
                .send(data)
                .end((error, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                });
        });
    }

    put(url, data) {
        const session = this;
        return new Promise(function (resolve, reject) {
            superagent
                .put(url)
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + session.accessToken)
                .set('accept', 'json')
                .send(data)
                .end((error, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                });
        });
    }

    patch(url, data) {
        const session = this;
        return new Promise(function (resolve, reject) {
            superagent
                .patch(url)
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + session.accessToken)
                .set('accept', 'json')
                .send(data)
                .end((error, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                });
        });
    }

    del(url, data) {
        const session = this;
        return new Promise(function (resolve, reject) {
            let request = superagent
                .del(url)
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + session.accessToken)
                .set('accept', 'json');

            // The bulk delete needs a body (a JSON array of ids).
            if (data !== undefined) {
                request = request.send(data);
            }

            request.end((error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    //// yyyy-MM-dd works, too but is not as precise
    getDateTimeString(date) {
        const iso = date.toISOString();
        return iso;
    }

    getDahsboard() {
        const url = apiUrl + '/dashboard';
        return this.get(url);
    }

    getLocations() {
        const url = apiUrl + '/locations';
        return this.get(url);
    }

    getRooms(locationId) {
        const url = apiUrl + '/locations/' + locationId + '/rooms';
        return this.get(url);
    }

    getAppliances(locationId, roomId) {
        const url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances';
        return this.get(url);
    }

    getApplianceInfo(locationId, roomId, applianceId) {
        const url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId;
        return this.get(url);
    }

    // Account-wide notifications --------------------------------------------------

    // GET /profile/notifications?pageSize=&continuationToken=  -> ProfileNotificationsPage
    getNotifications(pageSize, continuationToken) {
        let url = apiUrl + '/profile/notifications';
        const q = [];
        if (pageSize) {
            q.push('pageSize=' + pageSize);
        }
        if (continuationToken) {
            q.push('continuationToken=' + encodeURIComponent(continuationToken));
        }
        if (q.length) {
            url += '?' + q.join('&');
        }
        return this.get(url);
    }

    // Convenience: follows continuationToken to the end and returns the merged
    // notifications array. Capped at maxPages to avoid runaway calls.
    async getAllNotifications(pageSize) {
        const size = pageSize || 50;
        const maxPages = 20;
        let all = [];
        let continuationToken;

        for (let page = 0; page < maxPages; page++) {
            const response = await this.getNotifications(size, continuationToken);
            const parsed = JSON.parse(response.text);

            if (parsed && Array.isArray(parsed.notifications)) {
                all = all.concat(parsed.notifications);
            }

            continuationToken = parsed ? parsed.continuationToken : undefined;
            if (!continuationToken) {
                break;
            }
        }

        return all;
    }

    // GET /profile/notifications/{id}  -> ProfileNotification
    getNotification(notificationId) {
        return this.get(apiUrl + '/profile/notifications/' + notificationId);
    }

    // PUT /profile/notifications/{id}  with the ProfileNotification, is_read = true.
    // If the notification object is not supplied it is fetched first.
    async markNotificationRead(notificationId, notification) {
        let body = notification;
        if (body === undefined) {
            const response = await this.getNotification(notificationId);
            body = JSON.parse(response.text);
        }
        body.is_read = true;
        return this.put(apiUrl + '/profile/notifications/' + notificationId, body);
    }

    // PATCH /profile/notifications  with [ { notification_id, is_read:true }, ... ]
    markNotificationsRead(notifications) {
        return this.patch(apiUrl + '/profile/notifications', notifications);
    }

    // DELETE /profile/notifications/{id}
    deleteNotification(notificationId) {
        return this.del(apiUrl + '/profile/notifications/' + notificationId);
    }

    // DELETE /profile/notifications  with [ "id1", "id2", ... ]
    deleteNotifications(notificationIds) {
        return this.del(apiUrl + '/profile/notifications', notificationIds);
    }

    // LEGACY: per-appliance notifications route is no longer provided by the API.
    // Kept for backward compatibility; implemented via the account-wide getNotifications + appliance_id filter.
    async getApplianceNotifications(locationId, roomId, applianceId) {
        const all = await this.getAllNotifications();
        const filtered = all.filter(function (n) {
            return n.appliance_id === applianceId;
        });
        return { text: JSON.stringify(filtered) };
    }

    // LEGACY: per-appliance notification route is no longer provided by the API.
    // Kept for backward compatibility; implemented via the account-wide getNotifications + appliance_id / notification_id filter.
    async getApplianceNotificationId(locationId, roomId, applianceId, notificationId) {
        const all = await this.getAllNotifications();
        const match = all.filter(function (n) {
            return n.appliance_id === applianceId && n.notification_id === notificationId;
        });
        return { text: JSON.stringify(match.length > 0 ? match[0] : null) };
    }

    getApplianceData(locationId, roomId, applianceId, fromDate, toDate, groupBy) {
        let url =
            apiUrl +
            '/locations/' +
            locationId +
            '/rooms/' +
            roomId +
            '/appliances/' +
            applianceId +
            '/data/aggregated';

        if (fromDate) {
            const fromStr = this.getDateTimeString(fromDate);
            url += `?from=${fromStr}`;
        }

        if (toDate) {
            const toStr = this.getDateTimeString(toDate);
            url += `&to=${toStr}`;
        }

        if (groupBy) {
            url += `&groupBy=${groupBy}`;
        }

        return this.get(url);
    }

    getApplianceDetails(locationId, roomId, applianceId) {
        const url =
            apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId + '/details';
        return this.get(url);
    }

    getApplianceStatus(locationId, roomId, applianceId) {
        const url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId + '/status';
        return this.get(url);
    }

    getApplianceCommand(locationId, roomId, applianceId) {
        const url =
            apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId + '/command';
        return this.get(url);
    }

    setApplianceCommand(locationId, roomId, applianceId, data) {
        const url =
            apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId + '/command';
        return this.post(url, data);
    }

    // Builds a correct ApplianceCommand wrapper, whitelisting the command object to
    // the known COMMAND_KEYS so unrelated fields never leak into the body. (full command set)
    buildApplianceCommand(applianceId, type, command, commandb64) {
        const source = command || {};
        const filtered = {};
        for (const k of COMMAND_KEYS) {
            if (source[k] !== undefined) {
                filtered[k] = source[k];
            }
        }

        const body = {
            appliance_id: applianceId,
            type: type,
            command: filtered,
        };

        if (commandb64 !== undefined) {
            body.commandb64 = commandb64;
        }

        return body;
    }

    // Convenience: builds the ApplianceCommand wrapper then POSTs it.
    sendApplianceCommand(locationId, roomId, applianceId, type, command, commandb64) {
        const body = this.buildApplianceCommand(applianceId, type, command, commandb64);
        return this.setApplianceCommand(locationId, roomId, applianceId, body);
    }
}

// Exported Methds
// onRefreshFailed (optional) is forwarded to session.start() and called if a
// scheduled token refresh later fails. (#20)
async function login(username, password, onRefreshFailed) {
    const session = new OndusSession();

    await session.getActionUrl();
    await session.getTokenUrl(username, password);
    await session.getRefreshToken();

    session.start(onRefreshFailed);
    return session;
}

function logoff(session) {
    session.stop();
    session.accessToken = '';
}

function convertNotification(notification) {
    // Account-wide ProfileNotification already carries human-readable text
    // (title / description), so use it directly instead of the numeric mapping.
    if (notification && notification.notification_id !== undefined) {
        return {
            category: notification.category,
            type: notification.notification_type,
            message: notification.description || notification.title || '',
            notification: notification,
        };
    }

    // credits: https://github.com/faune/homebridge-grohe-sense/blob/master/src/ondusNotification.ts
    // credits: https://github.com/FlorianSW/grohe-ondus-api-java/blob/master/src/main/java/io/github/floriansw/ondus/api/model/Notification.java
    const notificationMessageByCategoryAndType = {
        category: {
            0: {
                text: 'Advertising',
                type: {
                    0: 'Unknown',
                },
            },
            10: {
                text: 'Information',
                type: {
                    10: 'Installation successful',
                    60: 'Firmware update available',
                    100: 'System Information [undefined]',
                    410: 'Installation of sense guard successful',
                    460: 'Firmware update of sense guard available',
                    555: 'Blue: auto flush active',
                    556: 'Blue: auto flush inactive',
                    557: 'Catridge empty',
                    559: 'Cleaning complete',
                    561: 'Order fully shipped',
                    563: 'Order fully delivered',
                    566: 'Order partially shipped',
                    560: 'Firmware update for blue available',
                    601: 'Nest away mode automatic control off',
                    602: 'Nest home mode automatic control off',
                    605: 'Connect with your insurer',
                    606: 'Device deactivated',
                },
            },
            20: {
                text: 'Warning',
                type: {
                    11: `Battery is at critical level`,
                    12: 'Battery is empty and must be changed',
                    20: 'Temperature levels have dropped below the minimum configured limit',
                    21: 'Temperature levels have exceeded the maximum configured limit',
                    30: 'Humidity levels have dropped below the minimum configured limit',
                    31: 'Humidity levels have exceeded the maximum configured limit',
                    40: 'Frost warning!',
                    80: 'Sense  lost WiFi',
                    320: 'Unusual water consumption detected - water has been SHUT OFF',
                    321: 'Unusual water consumption detected - water still ON',
                    330: 'Pressure drop detected during check of household water pipes',
                    332: 'Watersystem check not possible',
                    340: 'Frost warning! Current temperature is',
                    380: 'Sense guard lost WiFi',
                    420: 'Multiple water pressure drops detected - water supply switched off',
                    421: 'Multiple water pressure drops detected',
                    550: 'Blue filter low',
                    551: 'Blue CO2 low',
                    552: 'Blue empty filter',
                    553: 'Blue empty CO2',
                    558: 'Cleaning',
                    564: 'Filter stock empty',
                    565: 'CO2 stock empty',
                    580: 'Blue no connection',
                    603: 'GROHE Sense Guard did not respond – valve open',
                    604: 'GROHE Sense Guard did not respond – valve closed',
                },
            },
            /* Notifications in this category will always trigger leakServices */
            30: {
                text: 'Alarm',
                type: {
                    0: 'Flooding detected - water has been SHUT OFF',
                    50: 'Sensor error 50',
                    90: 'System error 90',
                    100: 'System error 100',
                    101: 'RTC error',
                    102: 'Acceleration sensor',
                    103: 'System out of service',
                    104: 'System memory error',
                    105: 'System relative temperature',
                    106: 'System water detection error',
                    107: 'System button error',
                    310: 'Extremely high flow rate - water supply switched off',
                    390: 'System error 390',
                    400: 'Maximum volume reached — water supply switched off',
                    430: 'Water detected by GROHE Sense - water supply switched off',
                    431: 'Water detected by GROHE Sense',
                },
            },
            40: {
                text: 'WebUrl',
                type: {
                    1: 'Web URL',
                },
            },
        },
    };

    const category = notification.category;
    const type = notification.type;

    const categoryInfo = notificationMessageByCategoryAndType.category[category];

    let message;
    let categoryText;
    if (categoryInfo !== undefined) {
        message = categoryInfo.type[type];
        categoryText = categoryInfo.text;
    } else {
        categoryText = 'Unknown';
    }

    if (message === undefined) {
        message = 'Unkown notification category: ' + category + ' type: ' + type;
    }

    const convertedNotification = {
        category: categoryText,
        type: type,
        message: message,
        notification: notification,
    };
    return convertedNotification;
}

// Exported Constants
const OndusType = {
    Sense: 101,
    SensePlus: 102,
    SenseGuard: 103,
    // BlueHome : 104 // TODO
};

exports.login = login;
exports.logoff = logoff;
exports.convertNotification = convertNotification;
exports.OndusType = Object.freeze(OndusType);
exports.COMMAND_KEYS = Object.freeze(COMMAND_KEYS);
exports.OndusSession = OndusSession;
