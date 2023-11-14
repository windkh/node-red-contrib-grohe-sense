// Note that the code is derived from the great work of the authors of the following projects: 
// https://github.com/FlorianSW/grohe-ondus-api-java/issues/3
// https://github.com/faune/homebridge-grohe-sense

'use strict';

const he = require('he');
const url = require('url');
const superagent = require('superagent');

let baseUrl = 'https://idp2-apigw.cloud.grohe.com';
let apiUrl = baseUrl + '/v3/iot'
let loginUrl = apiUrl + '/oidc/login';
let refreshUrl = apiUrl + '/oidc/refresh';

let actionPattern = "action=\"([^\"]*)\"";
let actionPrefix = "action=";
  

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
        let actionUrl;
    };

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
    getActionUrl(username, password) {
        let session = this;
        return new Promise(function (resolve, reject) {
            superagent
                .get(loginUrl)
                .end((error, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        if(response.status == 200){
                            let page = response.text;
                
                            let regEx = new RegExp(actionPattern);
                            let match = regEx.exec(page);
                            if (match !== null) {
                                var actionUrlText = match[0].replace(actionPrefix, '');
                                let encodedActionUrl = actionUrlText.substring(1, actionUrlText.length - 1);
                                
                                session.actionUrl = he.decode(encodedActionUrl);
                                session.cookie = response.header['set-cookie'];
                                resolve(response);
                            }
                            else {
                                reject("action not found in webform.");
                            }
                        }
                        else if(response.status == 302) {
                            // TODO: not tested!!!
                            session.cookie = response.header['set-cookie'];
                            session.tokenUrl = response.header.Location;
                            resolve(response);
                        }
                        else {
                            reject("Failed to get response from " + loginUrl);
                        }
                    }
                });
        });
    };

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
        let session = this;
        return new Promise(function (resolve, reject) {
            
            const form = new URLSearchParams();
            form.set('username', username);
            form.set('password', password);

            let content = form.toString();

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
                    
                        let status = response.status;
                        session.tokenUrl = response.header.location.replace('ondus://', 'https://');
                        resolve(response);
                    } else {
                        reject('Login for user ' + username + ' into grohe cloud failed:/n' + error );
                    }
                });
            });
    };

    getRefreshToken() {
        let session = this;
        return new Promise(function (resolve, reject) {
            superagent
                .get(session.tokenUrl)
                .set('Cookie', session.cookie)
                .end( (error, response) => {
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
                            reject("getRefreshToken failed to get token.");
                        }
                    }
                });
            });
    };

    refreshAccessToken() {
        let session = this;
        return new Promise(function (resolve, reject) {
            superagent
                .post(refreshUrl)
                .set('Content-Type', 'application/json')
                .set('accept', 'json')
                .send({'refresh_token' : session.refreshToken})
                .end((error, response) => {
                    if (error) {
                        reject(error);
                    } else {
                        if (response.body.access_token && response.body.expires_in) {
                            session.accessToken = response.body.access_token;
                            session.accessTokenExpiresIn = response.body.expires_in;
                            resolve(response);
                        } else {
                            reject("Failed to refresh access token");              
                        }
                    }
                });
            });
    };

    start() {
        let session = this;

        let interval = 1000 * session.accessTokenExpiresIn / 2; // 1800s
        session.refreshTimer = setInterval(function() {
            session.refreshAccessToken();
        }, interval);
    };

    stop() {
        let session = this;

        clearInterval(session.refreshTimer);
    };

    get(url) {
        let session = this;
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
    };

    post(url, data) {
        let session = this;
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

    //// yyyy-MM-dd works, too but is not as precise
    getDateTimeString(date) {
        let iso = date.toISOString();
        return iso;
    }

    getDahsboard() {
        let url = apiUrl + '/dashboard';
        return this.get(url);
    }

    getLocations() {
        let url = apiUrl + '/locations';
        return this.get(url);
    }

    getRooms(locationId) {
        let url = apiUrl + '/locations/' + locationId + '/rooms';
        return this.get(url);
    } 

    getAppliances(locationId, roomId) {
        let url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances';
        return this.get(url);
    }

    getApplianceInfo(locationId, roomId, applianceId) {
        let url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId;
        return this.get(url);
    }

    getApplianceNotifications(locationId, roomId, applianceId) {
        let url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId + '/notifications';
        return this.get(url);
    }

    getApplianceNotificationId(locationId, roomId, applianceId, notificationId) {
        let url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId + '/notifications/' + notificationId;
        return this.get(url);
    }

    getApplianceData(locationId, roomId, applianceId, fromDate, toDate, groupBy) {
        let url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId + '/data/aggregated';

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
        let url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId + '/details';
        return this.get(url);
    }

    getApplianceStatus(locationId, roomId, applianceId) {
        let url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId + '/status';
        return this.get(url);
    }

    getApplianceCommand(locationId, roomId, applianceId) {
        let url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId + '/command';
        return this.get(url);
    }
    
    setApplianceCommand(locationId, roomId, applianceId, data) {
        let url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId + '/command';
        return this.post(url, data);
    }   
};

// Exported Methds
async function login(username, password) {

    let session = new OndusSession();

    await session.getActionUrl();
    await session.getTokenUrl(username, password);
    await session.getRefreshToken();
    
    session.start();
    return session;
}

function logoff(session) {
    session.stop();
    session.accessToken = '';
}

function convertNotification(notification) {
    // credits: https://github.com/faune/homebridge-grohe-sense/blob/master/src/ondusNotification.ts
    // credits: https://github.com/FlorianSW/grohe-ondus-api-java/blob/master/src/main/java/io/github/floriansw/ondus/api/model/Notification.java
    let notificationMessageByCategoryAndType = {
        'category' : {
            0 : {
                'text' : 'Advertising',
                'type' : {
                    0   : 'Unknown',
                },
            },
            10 : {
                'text' : 'Information',
                'type'  : {
                    10  : 'Installation successful',
                    60  : 'Firmware update available',
                    100 : 'System Information [undefined]',
                    410 : 'Installation of sense guard successful',
                    460 : 'Firmware update of sense guard available',
                    555 : 'Blue: auto flush active',
                    556 : 'Blue: auto flush inactive',
                    557 : 'Catridge empty',
                    559 : 'Cleaning complete',
                    561 : 'Order fully shipped',
                    563 : 'Order fully delivered',
                    566 : 'Order partially shipped',
                    560 : 'Firmware update for blue available',
                    601 : 'Nest away mode automatic control off',
                    602 : 'Nest home mode automatic control off',
                    605 : 'Connect with your insurer',
                    606 : 'Device deactivated',
                },  
            },
            20 : {
                'text' : 'Warning',
                'type' : {
                    11  : `Battery is at critical level`,
                    12  : 'Battery is empty and must be changed',
                    20  : 'Temperature levels have dropped below the minimum configured limit',
                    21  : 'Temperature levels have exceeded the maximum configured limit',
                    30  : 'Humidity levels have dropped below the minimum configured limit',
                    31  : 'Humidity levels have exceeded the maximum configured limit',
                    40  : 'Frost warning!',
                    80  : 'Sense  lost WiFi',
                    320 : 'Unusual water consumption detected - water has been SHUT OFF',
                    321 : 'Unusual water consumption detected - water still ON',
                    330 : 'Pressure drop detected during check of household water pipes',
                    332 : 'Watersystem check not possible',
                    340 : 'Frost warning! Current temperature is',
                    380 : 'Sense guard lost WiFi',
                    420 : 'Multiple water pressure drops detected - water supply switched off',
                    421 : 'Multiple water pressure drops detected',
                    550 : 'Blue filter low',
                    551 : 'Blue CO2 low',
                    552 : 'Blue empty filter',
                    553 : 'Blue empty CO2',
                    558 : 'Cleaning',
                    564 : 'Filter stock empty',
                    565 : 'CO2 stock empty',
                    580 : 'Blue no connection',
                    603 : 'GROHE Sense Guard did not respond – valve open',
                    604 : 'GROHE Sense Guard did not respond – valve closed',
                },
            },
            /* Notifications in this category will always trigger leakServices */
            30 : {
                'text' : 'Alarm',
                'type' : {
                    0   : 'Flooding detected - water has been SHUT OFF',
                    50  : 'Sensor error 50',
                    90  : 'System error 90',
                    100 : 'System error 100',
                    101 : 'RTC error',
                    102 : 'Acceleration sensor',
                    103 : 'System out of service',
                    104 : 'System memory error',
                    105 : 'System relative temperature',
                    106 : 'System water detection error',
                    107 : 'System button error',
                    310 : 'Extremely high flow rate - water supply switched off',
                    390 : 'System error 390',
                    400 : 'Maximum volume reached — water supply switched off',
                    430 : 'Water detected by GROHE Sense - water supply switched off',
                    431 : 'Water detected by GROHE Sense',
                },
            },
            40 : {
                'text' : 'WebUrl',
                'type' : {
                    1   : 'Web URL',
                },
            },
        },
    };

    let category = notification.category;
    let type = notification.type;

    let categoryInfo = notificationMessageByCategoryAndType.category[category];

    let message;
    let categoryText;
    if (categoryInfo !== undefined) {
        message = categoryInfo.type[type];
        categoryText = categoryInfo.text;    
    }
    else {
        categoryText = 'Unknown';
    }

    if (message === undefined) {
        message = 'Unkown notification category: ' + category + ' type: ' + type;
    }

    let convertedNotification = {
        category : categoryText,
        type : type,
        message : message,
        notification : notification
    }
    return convertedNotification;
}

// Exported Constants
let OndusType = {
    Sense : 101,
    SensePlus : 102,
    SenseGuard : 103,
    // BlueHome : 104 // TODO
};


exports.login = login;
exports.logoff = logoff;
exports.convertNotification = convertNotification;
exports.OndusType = Object.freeze(OndusType); 

