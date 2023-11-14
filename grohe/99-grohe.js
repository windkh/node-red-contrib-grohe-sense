/**
* Created by Karl-Heinz Wind
**/

module.exports = function (RED) {
    "use strict";
    let ondusApi = require('./ondusApi.js');
    	
    // check if the input is already a date, if not it is probably a value in milliseconds. 
    function convertToDate(input) {
        let date = new Date(input);
        return date;
    }

    // Converts a status object to json. 
    function convertStatus(status) {
        let convertedStatus = {};

        for (let i=0; i < status.length; i++) {
            let item = status[i];
            convertedStatus[item.type] = item.value;
        }

        return convertedStatus;
    }

    function getMin(newValue, oldValue) {   
        if (isNaN(oldValue)) {
            return newValue;
        }                   
        if (newValue < oldValue) {
            return newValue;
        }
        else {
            return oldValue;
        }
    }

    function getMax(newValue, oldValue) { 
        if (isNaN(oldValue)) {
            return newValue;
        }                 
        if (newValue > oldValue) {
            return newValue;
        }
        else {
            return oldValue;
        }
    }

    function convertMeasurement(measurement) {
        let minTemperature = Number.NaN;
        let maxTemperature = Number.NaN;
        let minTemperatureGuard = Number.NaN;
        let maxTemperatureGuard = Number.NaN;
        let minHumidity = Number.NaN;
        let maxHumidity = Number.NaN;
        let minFlowrate = Number.NaN;
        let maxFlowrate = Number.NaN;
        let minPressure = Number.NaN;
        let maxPressure = Number.NaN;
        
        let length = measurement.length;
        for (let i=0; i < length; i++) {
            let item = measurement[i];

            let temperature = item.temperature;
            minTemperature = getMin(temperature, minTemperature);
            maxTemperature = getMax(temperature, maxTemperature);

            let temperatureGuard = item.temperature_guard;
            minTemperatureGuard = getMin(temperatureGuard, minTemperatureGuard);
            maxTemperatureGuard = getMax(temperatureGuard, maxTemperatureGuard);

            let humidity = item.humidity;
            minHumidity = getMin(humidity, minHumidity);
            maxHumidity = getMax(humidity, maxHumidity);
            
            let flowrate = item.flowrate;
            minFlowrate = getMin(flowrate, minFlowrate);
            maxFlowrate = getMax(flowrate, maxFlowrate);
    
            let pressure = item.pressure;
            minPressure = getMin(pressure, minPressure);
            maxPressure = getMax(pressure, maxPressure);
        }

        let from = measurement[0].date;
        let to = measurement[length - 1].date;
        let duration = (new Date(from) - new Date(to)) / 1000;
            
        let convertedMeasurement = {
            from : from,
            to : to,
            duration : duration,
            count : length,
        }

        if (!isNaN(minTemperature)){
            convertedMeasurement.temperature = {
                min : minTemperature,
                max : maxTemperature,
            }
        }

        if (!isNaN(minTemperatureGuard)){
            convertedMeasurement.temperatureGuard = {
                min : minTemperatureGuard,
                max : maxTemperatureGuard,
            }
        }

        if (!isNaN(minHumidity)){
            convertedMeasurement.humidity = {
                min : minHumidity,
                max : maxHumidity
            }
        }

        if (!isNaN(minFlowrate)){
            convertedMeasurement.flowrate = {
                min : minFlowrate,
                max : maxFlowrate,
            }
        }
         
        if (!isNaN(minPressure)){
            convertedMeasurement.pressure = {
                min : minPressure,
                max : maxPressure,
            }
        }

        return convertedMeasurement;
    }
    
    function convertWithdrawals(withdrawals) {

        let totalWaterConsumption = 0;
        let totalWaterCost = 0;
        let totalEnerygCost = 0;
        let totalHotwaterShare = 0;
        let totalMaxFlowrate = Number.NaN;
        
        let todayWaterConsumption = 0;
        let todayWaterCost = 0;
        let todayEnerygCost = 0;
        let todayHotwaterShare = 0;
        let todayMaxFlowrate = Number.NaN;
        
        let length = withdrawals.length;
        if(length > 0) {
            let todayDate = withdrawals[0].date;
            let today = new Date(new Date(todayDate).toDateString());
    
            for (let i=0; i < length; i++) {
                let item = withdrawals[i];
    
                let date = new Date(item.date);
                totalWaterConsumption += item.waterconsumption;
                totalWaterCost += item.water_cost;
                totalEnerygCost += item.energy_cost;
                totalHotwaterShare += item.hotwater_share;
                let flowrate = item.maxflowrate;
                totalMaxFlowrate = getMax(flowrate, totalMaxFlowrate);
    
                if(date >= today) {
                    todayWaterConsumption += item.waterconsumption;
                    todayWaterCost += item.water_cost;
                    todayEnerygCost += item.energy_cost;
                    todayHotwaterShare += item.hotwater_share;
                    todayMaxFlowrate = getMax(flowrate, todayMaxFlowrate);
                }
            }
        }

        let convertWithdrawals = {
            from : withdrawals[0].date,
            to : withdrawals[length - 1].date,
            count : length,
            totalWaterConsumption : totalWaterConsumption,
            totalWaterCost : totalWaterCost,
            totalEnerygCost : totalEnerygCost,
            totalHotwaterShare : totalHotwaterShare,
            todayWaterConsumption : todayWaterConsumption,
            todayWaterCost : todayWaterCost,
            todayEnerygCost : todayEnerygCost,
            todayHotwaterShare : todayHotwaterShare 
        }

        if (!isNaN(totalMaxFlowrate)){
            convertWithdrawals.totalMaxFlowrate = totalMaxFlowrate;
        }

        if (!isNaN(todayMaxFlowrate)){
            convertWithdrawals.todayMaxFlowrate = todayMaxFlowrate;
        }

        return convertWithdrawals;
    }

    // Calculates statistics for a measurement data object. 
    function convertData(data) {
        let statistics = {};

        let measurement = data.measurement;
        if (measurement) {
            let length = measurement.length;
            if (length > 0){
                statistics.measurement = convertMeasurement(measurement);
            }
        }

        let withdrawals = data.withdrawals;
        if (withdrawals) {
            let length = withdrawals.length;
            if (length > 0){
                statistics.withdrawals = convertWithdrawals(withdrawals);
            }
        }

        return statistics;
    }

    // Converts notifications to a notification with text. 
    function convertNotifications(notifications) {
        let convertedNotifications = [];

        for (let i=0; i < notifications.length; i++) {
            let notification = notifications[i];
            let convertedNotification = ondusApi.convertNotification(notification);
            convertedNotifications.push(convertedNotification);
        }

        return convertedNotifications;
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
                            node.log('location ' + location.name);
                        
                            node.rooms = location.rooms;
                        
                            for (let j = 0; j < node.rooms.length; j++) {
                                let room = node.rooms[j];
                                node.log('    room ' + room.name);
                        
                                let appliances = room.appliances;
                                node.appliancesByRoomName[room.name] = {
                                    room : room,
                                    appliances : appliances,
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
                        else {
                            // not used.
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
                            if(msg.payload !== undefined && msg.payload.data !== undefined ){
                                let fromDate = convertToDate(msg.payload.data.from);
                                let toDate = convertToDate(msg.payload.data.to);
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
                                catch(exception){
                                    let errorMessage = 'getApplianceData failed: ' + exception.message;
                                    node.error(errorMessage, msg);
                                    node.status({ fill: 'red', shape: 'ring', text: 'failed' });
                                }
                            }

                            // For Debugging only
                            if (msg.debug === true){
                                let  debugMsg = {
                                    debug : {
                                        applianceIds : node.applianceIds,
                                        info : info,
                                        status : status,
                                        details : details,
                                        notifications : notifications,
                                        applianceData : data
                                    }
                                };
                                node.warn(debugMsg);
                            }

                            let result = {};

                            if(info != null){
                                result.info = info;
                            }

                            if(status != null){
                                result.status = convertStatus(status);
                            }
                            
                            if(details != null){
                                result.details = details;
                            }

                            if(notifications != null){
                                result.notifications = convertNotifications(notifications);
                            }

                            if(data != null){
                                result.data = data.data;
                                result.statistics = convertData(data.data);
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