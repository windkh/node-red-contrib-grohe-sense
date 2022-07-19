/**
* Created by Karl-Heinz Wind
**/

module.exports = function (RED) {
    "use strict";
    var ondusApi = require('./ondusApi.js');
    	
    // check if the input is already a date, if not it is probably a value in milliseconds. 
    function convertToDate(input) {
        let date = new Date(input);
        return date;
    }

    // --------------------------------------------------------------------------------------------
    // The configuration node
    // holds the username and password
    // and establishes the connection to the server
    function GroheLocationNode(n) {
        RED.nodes.createNode(this, n);

        let node = this;
        node.config = n;
        node.locationName = n.location;
        node.connected = false;

        node.appliancesByRoomName = {};
        
        if(node.credentials !== undefined && node.credentials.username !== undefined && node.credentials.password !== undefined 
            && node.credentials.username !== '' && node.credentials.password !== '') {

            (async() => {

                try {
                    node.session = await ondusApi.login(node.credentials.username, node.credentials.password);
                    
                    let response = await node.session.getDahsboard();
                    let dashboard = JSON.parse(response.text);

                    let locations = dashboard.locations

                    for (let i = 0; i < locations.length; i++) {
                        let location = locations[i];
                        if (location.name === node.locationName){
                            node.location = location;
                        
                            node.rooms = location.rooms;
                        
                            for (let j = 0; j < node.rooms.length; j++) {
                                let room = node.rooms [j];

                                let appliances = room.appliances;
                                node.appliancesByRoomName[room.name] = {
                                    room : room,
                                    appliances : appliances,
                                };
                            }

                            node.connected = true;
                            node.emit('initialized');
                            break;
                        }
                    }

                }
                catch (exception){
                    node.connected = false;
                    node.emit('initializeFailed', exception);
                    node.warn(exception);
                }    
            })()
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

        this.getApplianceIds = function (roomName, applianceName) {
        
            let applianceIds;
          
            if (node.appliancesByRoomName[roomName] !== undefined) {
                let value = node.appliancesByRoomName[roomName];

                let appliances = value.appliances;
                let room = value.room;
                for (let i = 0; i < appliances.length; i++) {
                    let appliance = appliances [i];

                    if (appliance.name === applianceName) {
                        applianceIds = {
                            locationId : node.location.id,
                            roomId : room.id,
                            applianceId : appliance.appliance_id // why not id here? 
                        };

                        break;
                    }
                }
            }

            return applianceIds;
        };
    }

    RED.nodes.registerType('grohe location', GroheLocationNode, {
        credentials: {
            username: { type: "text" },
            password: { type: "password" },
        }
    });
	
	
    // --------------------------------------------------------------------------------------------
    // The sense node controls a grohe sense.
    function GroheSenseNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
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
                if (node.applianceIds !== undefined){
                    node.status({ fill: 'green', shape: 'ring', text: 'connected' });
    
                    node.on('input', async function (msg) {

                        try
                        {
                            node.status({ fill: 'green', shape: 'ring', text: 'updating...' });

                            if(node.devicetype === ondusApi.OndusType.SenseGuard){
                                if (msg.payload !== undefined && msg.payload.command !== undefined){
                                    let data = msg.payload;
                                    data.type = node.devicetype;
                                    let response = await node.config.session.setApplianceCommand(
                                        node.applianceIds.locationId,
                                        node.applianceIds.roomId,
                                        node.applianceIds.applianceId,
                                        data);
                                    // Hint: respsonse is not used right now.
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
                            
                            let responseNotifications = await node.config.session.getApplianceNotifications(
                                node.applianceIds.locationId,
                                node.applianceIds.roomId,
                                node.applianceIds.applianceId);
                            let notifications = JSON.parse(responseNotifications.text);
   
                            let data;
                            if(msg.payload !== undefined && msg.payload.data !== undefined ){
                                let fromDate = convertToDate(msg.payload.data.from);
                                let toDate = convertToDate(msg.payload.data.to);

                                try {
                                    let responseData = await node.config.session.getApplianceData(
                                        node.applianceIds.locationId,
                                        node.applianceIds.roomId,
                                        node.applianceIds.applianceId,
                                        fromDate,
                                        toDate);
                                    data = JSON.parse(responseData.text);
                                }
                                catch(exception){
                                    let errorMessage = 'getApplianceData failed: ' + exception.message;
                                    node.error(errorMessage, msg);
                                    node.status({ fill: 'red', shape: 'ring', text: 'failed' });
                                }
                            }

                            let result = {};

                            if(info != null){
                                result.info = info;
                            }

                            if(status != null){
                                result.status = status;
                            }
                            
                            if(notifications != null){
                                result.notifications = notifications;
                            }

                            if(data != null){
                                result.data = data.data;
                            }

                            if (info[0].type === ondusApi.OndusType.SenseGuard) {
                                let response4 = await node.config.session.getApplianceCommand(
                                    node.applianceIds.locationId,
                                    node.applianceIds.roomId,
                                    node.applianceIds.applianceId);
                                let command = JSON.parse(response4.text);
                                result.command = command.command;
                                // Here timestamp could also be interessting in future.
                            }
                        
                            msg.payload = result;
                            node.send([msg]);
                            
                            let notificationCount = 0;
                            if(notifications !== undefined){
                                notificationCount = notifications.length;
                            }

                            if (notificationCount == 0){
                                node.status({ fill: 'green', shape: 'ring', text: 'ok' });
                            }
                            else {
                                node.status({ fill: 'yellow', shape: 'dot', text: notificationCount + ' notifications' });
                            }
                        }
                        catch (exception){
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
    RED.nodes.registerType("grohe sense", GroheSenseNode);
}