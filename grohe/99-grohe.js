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
            
            let response = await ondusApi.getLocations(node.session);
            let locations = JSON.parse(response.text);

            for (let i = 0; i < locations.length; i++) {
                let location = locations[i];
                if (location.name === node.locationName){
                    node.location = location;
                   
                    let response2 = await ondusApi.getRooms(node.session, node.location.id);
                    node.rooms = JSON.parse(response2.text);
                   
                    for (let j = 0; j < node.rooms.length; j++) {
                        let room = node.rooms [j];

                        let response3 = await ondusApi.getAppliances(node.session, node.location.id, room.id);
                        let appliances = JSON.parse(response3.text);
                        node.appliancesByRoomName[room.name] = {
                            room : room,
                            appliances : appliances,
                        };
                    }

                    node.connected = true;
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

		node.config = RED.nodes.getNode(node.location);
        if (node.config) {
               
            node.locationId = node.config.locationId;

            // TODO: check location, room, applicance
            node.status({ fill: 'green', shape: 'ring', text: 'connected' });

            this.on('input', async function (msg) {

                if (node.config.connected) {

                    node.status({ fill: 'green', shape: 'ring', text: 'updating...' });
                
                    let applianceIds = node.config.getApplianceIds(node.roomName, node.applianceName);
                    let response1 = await ondusApi.getApplianceInfo(
                        node.config.session,
                        applianceIds.locationId,
                        applianceIds.roomId,
                        applianceIds.applianceId);
                    let info = JSON.parse(response1.text);
                    
                    let response2 = await ondusApi.getApplianceStatus(
                            node.config.session,
                            applianceIds.locationId,
                            applianceIds.roomId,
                            applianceIds.applianceId);
                    let status = JSON.parse(response2.text);
                    
                    let response3 = await ondusApi.getApplianceNotifications(
                        node.config.session,
                        applianceIds.locationId,
                        applianceIds.roomId,
                        applianceIds.applianceId);
                    let notifications = JSON.parse(response3.text);
                    
                    msg.payload = {
                        info : info,
                        status : status,
                        notifications : notifications
                    };
                    node.send([msg]);
                    
                    node.status({ fill: 'green', shape: 'ring', text: 'ok' });

                }
                else {
                    node.status({ fill: 'yellow', shape: 'ring', text: 'not connected yet.' });
                }
            });
        }
        else {
            node.status({ fill: 'red', shape: 'ring', text: 'no config' });
        }
    }
    RED.nodes.registerType("grohe sense", GroheSenseNode);
}