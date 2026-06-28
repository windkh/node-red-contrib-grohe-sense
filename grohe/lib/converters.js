'use strict';

const ondusApi = require('./ondusApi.js');

// The aggregated-data endpoint buckets by one of these values (the api expects them
// in lower case); hour is the finest (no minute-level option), year the coarsest.
const VALID_GROUP_BY = ['hour', 'day', 'week', 'month', 'year'];

// check if the input is already a date, if not it is probably a value in milliseconds.
function convertToDate(input) {
    let date = new Date(input);
    return date;
}

// Normalizes a groupBy value to the lower-case form the api expects (hour / day / month).
function normalizeGroupBy(groupBy) {
    return typeof groupBy === 'string' ? groupBy.toLowerCase() : groupBy;
}

function isValidGroupBy(groupBy) {
    return VALID_GROUP_BY.indexOf(groupBy) !== -1;
}

// Pulls the two useful arrays out of an aggregated-data response. Tolerates the
// AggregatedData -> data -> { group_by, measurement, withdrawals } nesting and
// defaults missing arrays to [] so callers never have to null-check. (aggregated data)
function extractAggregated(parsedResponse) {
    let content = (parsedResponse && parsedResponse.data) || {};
    return {
        groupBy: content.group_by,
        measurements: Array.isArray(content.measurement) ? content.measurement : [],
        withdrawals: Array.isArray(content.withdrawals) ? content.withdrawals : [],
    };
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
            // The changed api renamed the day-grouped field to max_flowrate;
            // data_latest still uses maxflowrate, so accept both. (#26)
            let flowrate = item.max_flowrate !== undefined ? item.max_flowrate : item.maxflowrate;
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

// Extracts the consumption summary that the changed Sense Guard api exposes in
// details.data_latest (daily / average consumption and cost). Returns undefined
// when none of the fields are present (e.g. for a Sense device). (#26)
function convertConsumption(dataLatest) {
    let fields = [
        'daily_consumption',
        'daily_cost',
        'average_daily_consumption',
        'average_monthly_consumption',
    ];

    let consumption = {};
    let found = false;
    for (let i = 0; i < fields.length; i++) {
        let field = fields[i];
        if (dataLatest[field] !== undefined) {
            consumption[field] = dataLatest[field];
            found = true;
        }
    }

    return found ? consumption : undefined;
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
    VALID_GROUP_BY,
    convertToDate,
    normalizeGroupBy,
    isValidGroupBy,
    extractAggregated,
    convertStatus,
    getMin,
    getMax,
    convertMeasurement,
    convertWithdrawals,
    convertData,
    convertConsumption,
    convertNotifications,
};
