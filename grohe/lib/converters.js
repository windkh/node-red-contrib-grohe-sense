'use strict';

const ondusApi = require('./ondusApi.js');

// check if the input is already a date, if not it is probably a value in milliseconds.
function convertToDate(input) {
    let date = new Date(input);
    return date;
}

// Converts a status array to a flat object keyed by type.
function convertStatus(status) {
    let convertedStatus = {};

    for (let i = 0; i < status.length; i++) {
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
    for (let i = 0; i < length; i++) {
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
        from: from,
        to: to,
        duration: duration,
        count: length,
    };

    if (!isNaN(minTemperature)) {
        convertedMeasurement.temperature = {
            min: minTemperature,
            max: maxTemperature,
        };
    }

    if (!isNaN(minTemperatureGuard)) {
        convertedMeasurement.temperatureGuard = {
            min: minTemperatureGuard,
            max: maxTemperatureGuard,
        };
    }

    if (!isNaN(minHumidity)) {
        convertedMeasurement.humidity = {
            min: minHumidity,
            max: maxHumidity,
        };
    }

    if (!isNaN(minFlowrate)) {
        convertedMeasurement.flowrate = {
            min: minFlowrate,
            max: maxFlowrate,
        };
    }

    if (!isNaN(minPressure)) {
        convertedMeasurement.pressure = {
            min: minPressure,
            max: maxPressure,
        };
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
    if (length > 0) {
        let todayDate = withdrawals[0].date;
        let today = new Date(new Date(todayDate).toDateString());

        for (let i = 0; i < length; i++) {
            let item = withdrawals[i];

            let date = new Date(item.date);
            totalWaterConsumption += item.waterconsumption;
            totalWaterCost += item.water_cost;
            totalEnerygCost += item.energy_cost;
            totalHotwaterShare += item.hotwater_share;
            let flowrate = item.maxflowrate;
            totalMaxFlowrate = getMax(flowrate, totalMaxFlowrate);

            if (date >= today) {
                todayWaterConsumption += item.waterconsumption;
                todayWaterCost += item.water_cost;
                todayEnerygCost += item.energy_cost;
                todayHotwaterShare += item.hotwater_share;
                todayMaxFlowrate = getMax(flowrate, todayMaxFlowrate);
            }
        }
    }

    let convertedWithdrawals = {
        from: withdrawals[0].date,
        to: withdrawals[length - 1].date,
        count: length,
        totalWaterConsumption: totalWaterConsumption,
        totalWaterCost: totalWaterCost,
        totalEnerygCost: totalEnerygCost,
        totalHotwaterShare: totalHotwaterShare,
        todayWaterConsumption: todayWaterConsumption,
        todayWaterCost: todayWaterCost,
        todayEnerygCost: todayEnerygCost,
        todayHotwaterShare: todayHotwaterShare,
    };

    if (!isNaN(totalMaxFlowrate)) {
        convertedWithdrawals.totalMaxFlowrate = totalMaxFlowrate;
    }

    if (!isNaN(todayMaxFlowrate)) {
        convertedWithdrawals.todayMaxFlowrate = todayMaxFlowrate;
    }

    return convertedWithdrawals;
}

// Calculates statistics for a measurement data object.
function convertData(data) {
    let statistics = {};

    let measurement = data.measurement;
    if (measurement) {
        let length = measurement.length;
        if (length > 0) {
            statistics.measurement = convertMeasurement(measurement);
        }
    }

    let withdrawals = data.withdrawals;
    if (withdrawals) {
        let length = withdrawals.length;
        if (length > 0) {
            statistics.withdrawals = convertWithdrawals(withdrawals);
        }
    }

    return statistics;
}

// Converts notifications to a notification with text.
function convertNotifications(notifications) {
    let convertedNotifications = [];

    for (let i = 0; i < notifications.length; i++) {
        let notification = notifications[i];
        let convertedNotification = ondusApi.convertNotification(notification);
        convertedNotifications.push(convertedNotification);
    }

    return convertedNotifications;
}

module.exports = {
    convertToDate,
    convertStatus,
    getMin,
    getMax,
    convertMeasurement,
    convertWithdrawals,
    convertData,
    convertNotifications,
};
