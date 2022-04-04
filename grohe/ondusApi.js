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
            
            let content = 'username=' + username + '&password=' + password;

            superagent
                .post(session.actionUrl)
                .set('Cookie', session.cookie)
                .set('Content-Type', 'application/x-www-form-urlencoded')
                .send(content)
                .buffer(false)
                .redirects(0)
                .end((error, response) => {
                    if (response && response.header.location) {
                    
                        let status = response.status;
                        session.tokenUrl = response.header.location.replace('ondus://', 'https://');
                        resolve(response);
                    } else {
                        reject('Login for user ' + username + ' into grohe cloud failed.');
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
                    if (response) {
                        if (response.body.access_token && response.body.refresh_token) {
                            session.accessToken = response.body.access_token;
                            session.accessTokenExpiresIn = response.body.expires_in;
                            session.refreshToken = response.body.refresh_token;
                            session.refreshTokenExpiresIn = response.body.refresh_expires_in;
                            resolve(response);
                        } else {
                            reject(response);
                        }
                    } else {
                        reject(error);
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
                            reject(response);              
                        }
                    }
                });
            });
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
                        const errMsg = 'get(): Unexpected server response:' + error;
                        reject(errMsg);
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
                        const errMsg = 'post(): Unexpected server response:' + error;
                        reject(errMsg);
                    } else {
                        resolve(response);
                    }
                });
            });
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

    getApplianceData(locationId, roomId, applianceId, fromDate, toDate) {
        let url = apiUrl + '/locations/' + locationId + '/rooms/' + roomId + '/appliances/' + applianceId + '/data';
        if (fromDate) {
            const fromStr = fromDate.toISOString().split('T')[0];
            url += `?from=${fromStr}`;
        }
        if (toDate) {
            const toStr = toDate.toISOString().split('T')[0];
            url += `&to=${toStr}`;
        }

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
    
    return session;
}

// Exported Constants
let OndusType = {
    Sense : 101,
    SensePlus : 102,
    SenseGuard : 103,
    // BlueHome : 104 // TDOD
};


exports.login = login;
exports.OndusType = Object.freeze(OndusType); 

