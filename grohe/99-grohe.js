/**
* Created by Karl-Heinz Wind
**/

module.exports = function (RED) {
    "use strict";
    var ondusApi = require('./ondusApi.js');
    	
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
        
        (async() => {
            node.session = await ondusApi.login(node.credentials.username, node.credentials.password);
            
            let response = await node.session.getLocations();
            let locations = JSON.parse(response.text);

            for (let i = 0; i < locations.length; i++) {
                let location = locations[i];
                if (location.name === node.locationName){
                    node.location = location;
                   
                    let response2 = await node.session.getRooms(node.location.id);
                    node.rooms = JSON.parse(response2.text);
                   
                    for (let j = 0; j < node.rooms.length; j++) {
                        let room = node.rooms [j];

                        let response3 = await node.session.getAppliances(node.location.id, room.id);
                        let appliances = JSON.parse(response3.text);
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
        })()

        this.on('close', function (done) {
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

            node.status({ fill: 'green', shape: 'ring', text: 'initializing' });

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
                            
                            let response1 = await node.config.session.getApplianceInfo(
                                node.applianceIds.locationId,
                                node.applianceIds.roomId,
                                node.applianceIds.applianceId);
                            let info = JSON.parse(response1.text);
                            
                            let response2 = await node.config.session.getApplianceStatus(
                                    node.applianceIds.locationId,
                                    node.applianceIds.roomId,
                                    node.applianceIds.applianceId);
                            let status = JSON.parse(response2.text);
                            
                            let response3 = await node.config.session.getApplianceNotifications(
                                node.applianceIds.locationId,
                                node.applianceIds.roomId,
                                node.applianceIds.applianceId);
                            let notifications = JSON.parse(response3.text);

                            let result = {
                                info : info,
                                status : status,
                                notifications : notifications,
                            };

                            if (info[0].type === ondusApi.OndusType.SenseGuard) {

                                let response4 = await node.config.session.getApplianceCommand(
                                    node.applianceIds.locationId,
                                    node.applianceIds.roomId,
                                    node.applianceIds.applianceId);
                                let command = JSON.parse(response4.text);

                                // Here timestamp could also be interessting in future.
                                result.command = command.command;
                            }
                        
                            msg.payload = result;
                            node.send([msg]);
                            
                            let notificationCount = notifications.length;
                            if (notificationCount == 0){
                                node.status({ fill: 'green', shape: 'ring', text: 'ok' });
                            }
                            else {
                                node.status({ fill: 'yellow', shape: 'dot', text: notificationCount + ' notifications' });
                            }
                        }
                        catch (exception){
                            let errorMessage = 'Caught exception:\r\n' + exception + '\r\nwhen processing message: \r\n' + JSON.stringify(msg);
                            node.error(errorMessage, msg);
                        }
                    });
                }   
                else {
                    node.status({ fill: 'red', shape: 'ring', text: node.applianceName + ' not found ' });
                }     

            };
            node.config.addListener('initialized', node.onInitialized);

            this.on('close', function () {
                if (node.onInitialized) {
                    node.config.removeListener('initialized', node.onInitialized);
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