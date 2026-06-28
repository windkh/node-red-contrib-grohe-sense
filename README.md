# Grohe Sense nodes for node-red
[![Platform](https://img.shields.io/badge/platform-Node--RED-red)](https://nodered.org)
![License](https://img.shields.io/github/license/windkh/node-red-contrib-grohe-sense.svg)
[![NPM](https://img.shields.io/npm/v/node-red-contrib-grohe-sense?logo=npm)](https://www.npmjs.org/package/node-red-contrib-grohe-sense)
[![Known Vulnerabilities](https://snyk.io/test/npm/node-red-contrib-grohe-sense/badge.svg)](https://snyk.io/test/npm/node-red-contrib-grohe-sense)
[![Downloads](https://img.shields.io/npm/dm/node-red-contrib-grohe-sense.svg)](https://www.npmjs.com/package/node-red-contrib-grohe-sense)
[![Total Downloads](https://img.shields.io/npm/dt/node-red-contrib-grohe-sense.svg)](https://www.npmjs.com/package/node-red-contrib-grohe-sense)
[![Package Quality](http://npm.packagequality.com/shield/node-red-contrib-grohe-sense.png)](http://packagequality.com/#?package=node-red-contrib-grohe-sense)
[![Open Issues](https://img.shields.io/github/issues-raw/windkh/node-red-contrib-grohe-sense.svg)](https://github.com/windkh/node-red-contrib-grohe-sense/issues)
[![Closed Issues](https://img.shields.io/github/issues-closed-raw/windkh/node-red-contrib-grohe-sense.svg)](https://github.com/windkh/node-red-contrib-grohe-sense/issues?q=is%3Aissue+is%3Aclosed)
...

This package contains nodes for controlling grohe sense devices via the following API:
https://idp2-apigw.cloud.grohe.com


# Dependencies
This package depends on the following libraries
- superagent
- he
- url


# Disclaimer
This package is not developed nor officially supported by the company Grohe.
It is for demonstrating how to communicate to the devices using node-red.
Use on your own risk!

The code was ported from C# and Java and TypeScript which can be found here:
https://github.com/J0EK3R/Grohe.Ondus.Api
https://github.com/FlorianSW/grohe-ondus-api-java
https://github.com/faune/homebridge-grohe-sense


# Thanks for your donation
If you want to support this free project. Any help is welcome. You can donate by clicking one of the following links:

<a target="blank" href="https://blockchain.com/btc/payment_request?address=1PBi7BoZ1mBLQx4ePbwh1MVoK2RaoiDsp5"><img src="https://img.shields.io/badge/Donate-Bitcoin-green.svg"/></a>
<a target="blank" href="https://www.paypal.me/windkh"><img src="https://img.shields.io/badge/Donate-PayPal-blue.svg"/></a>

<a href="https://www.buymeacoffee.com/windka" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>


# Credits
- FlorianSW for developing the initial version in JAVA
- J0EK3R for porting the original JAVA implementation to C#
- faune for doing the great work in TypeScript. This made me port my code from axios to superagent. 


# Changelog
Changes can be followed [here](/CHANGELOG.md)


# Project layout
```
grohe/
  99-grohe.html        Editor UI and inline help for both nodes
  99-grohe.js          Node-RED entry point (just wires the two nodes up)
  icons/
  lib/
    ondusApi.js        Low-level Ondus REST client and notification helpers
    converters.js      Pure helpers: status / measurement / withdrawal conversion
  nodes/
    grohe-location-node.js   Configuration node (login + dashboard cache)
    grohe-sense-node.js      The grohe sense / plus / guard node
test/                  Unit tests (mocha)
examples/              Sample flows
```


# Nodes

## `grohe location` (configuration node)
Holds the Ondus credentials and identifies the location to operate on.

| Property | Type | Description |
| --- | --- | --- |
| Location | string | Name of the location as it appears in the Grohe Ondus app. |
| Username | string | Email of the Grohe Ondus account. |
| Password | string | Password of the Grohe Ondus account (stored encrypted by Node-RED). |

On startup the node logs in, retrieves the dashboard, and caches the rooms and appliances of the configured location. The access token is automatically refreshed every 30 minutes.

If the internet is unavailable at startup (or the connection is later lost — including a failed token refresh), the node keeps retrying the login with exponential backoff (5s up to 60s) and recovers automatically once connectivity returns. Connection attempts, successes, and failures are written to the Node-RED log to aid debugging. While disconnected, the dependent `grohe sense` nodes show *disconnected*. (see [#20](https://github.com/windkh/node-red-contrib-grohe-sense/issues/20))


## `grohe sense`
The node is able to get the status of a Grohe Sense, Grohe Sense Plus or Grohe Sense Guard appliance. It is also used to send commands to a Sense Guard.

> **Note on names:** the *Room* and *Name* (appliance) must match the values shown in the Grohe Ondus app **exactly**, including spaces and capitalization. If they don't match, the node logs the available room / appliance names to help you correct them. If commands such as *open/close valve* time out while reading still works, the configured name is likely resolving to a stale appliance that is no longer fully registered — rename it in the app and re-select it here. (see [#25](https://github.com/windkh/node-red-contrib-grohe-sense/issues/25))

### Inputs
Any incoming message triggers a poll. The optional fields on `msg.payload` control what happens:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `payload.command` | object | no | Only honoured for Sense Guard (type `103`). An object of command fields (see *Sending commands*). Only whitelisted, correctly-typed fields are sent. Example: `{ valve_open: true }`. |
| `payload.commandb64` | string | no | Optional base64 command blob, passed through only when present. |
| `payload.data.from` | Date \| number | no | Start of the historical range (Date object or milliseconds). |
| `payload.data.to` | Date \| number | no | End of the historical range. |
| `payload.data.groupBy` | string | no | Aggregation granularity: `hour`, `day`, `week`, `month`, or `year` (the API expects lower case; input is accepted in any case and lower-cased; `hour` is the finest). An invalid value is rejected and falls back to `day`. |
| `msg.debug` | boolean | no | If `true`, the raw API responses are emitted as a debug warning. |

### Polling & rate limits
The Grohe Ondus cloud is **rate limited**: more than ~1000 requests within 24&nbsp;h to a single endpoint (e.g. `/dashboard`) get that endpoint **blocked for 24&nbsp;h**, which then surfaces as `Caught exception: Forbidden` (HTTP 403). Each trigger of this node makes several requests (info, status, details, notifications, and — for Sense Guard — command), so an `inject` node firing too often will exhaust the budget quickly. (see [#24](https://github.com/windkh/node-red-contrib-grohe-sense/issues/24))

There is **no push/notification mechanism** — to react to notifications (e.g. a leak alarm or a closed valve) you have to poll. Pick the polling interval with the device's own update cadence and the rate limit in mind:

- A **Sense Guard** uploads its measurements every **~15 minutes**, so polling more often than that yields no new data. Polling **every 15 minutes** (≈96 requests/endpoint/day) is a safe default.
- A **Sense** uploads only **once a day**, so polling it a few times a day is plenty.
- **Alarms and valve interactions** are communicated to the cloud immediately by the device, but since this integration only polls, the shortest interval at which you could still catch them without risking the limit is roughly **once every 1–2 minutes per appliance** — and only if that is the *only* thing triggering the node. If you want fast alarm reaction, dedicate a node to it and keep all other polling slow.
- Avoid wiring several `inject`/poll paths to the same appliance; each one multiplies the request count against the same endpoints.

### Sending commands
**Sense Guard only (type `103`).** Put the command fields on `msg.payload.command`; the node validates them, drops unknown keys, and builds the correct request body — `{ appliance_id, type, command }` (plus `commandb64` if you supplied one). You only need to set the field(s) you want to change: the API validates the command object as a whole and requires the complete field set, so the node first reads the current command and **merges** your changes onto it before sending the full object.

```js
msg.payload = { command: { valve_open: true } };                                   // open the main valve
msg.payload = { command: { valve_open: false, buzzer_on: true, buzzer_sound_profile: 2 } };
msg.payload = { command: { measure_now: true } };                                  // take a reading now
```

| Field | Type | Notes |
| --- | --- | --- |
| `valve_open` | bool | Open / close the main valve (Sense Guard). |
| `measure_now` | bool | Take a reading now (Sense Guard). |
| `pressure_measurement_running` | bool | Sense Guard. |
| `buzzer_on` | bool | Sense / Sense Guard. |
| `buzzer_sound_profile` | int | Sense / Sense Guard. |
| `get_current_measurement` | bool | Shared. |
| `cleaning_mode` | bool | GROHE Blue. |
| `co2_status_reset` | bool | GROHE Blue. |
| `filter_status_reset` | bool | GROHE Blue. |
| `temp_user_unlock_on` | bool | GROHE Blue. |
| `reason_for_change` | int | Shared, optional metadata. |

A wrong value type (e.g. `valve_open: "yes"`) is rejected with a `node.error` and nothing is sent. The underlying REST call:

```
POST …/appliances/{applianceId}/command
{ "appliance_id": "…", "type": 103, "command": { "valve_open": true } }
```

See the example flow [**senseguardcommand**](examples/senseguardcommand.json).

### Outputs
`msg.payload` is replaced with an object containing the following fields:

| Field | Type | Notes |
| --- | --- | --- |
| `info` | object | Static appliance information (serial, type, firmware, configuration). |
| `status` | object | Current status flattened as `{ type: value }` (battery, wifi quality, connection state, ...). |
| `details` | object | Detailed configuration of the appliance. |
| `measurement` | object | Most recent reading (`temperature`, `humidity`, `battery`, or for Sense Guard `flowrate`/`pressure`/`temperature_guard`, plus `timestamp`) taken from `details.data_latest` — only present when the appliance reports it. |
| `withdrawal` | object | Sense Guard only: the latest water withdrawal (`starttime`, `stoptime`, `waterconsumption`, `maxflowrate`) from `details.data_latest`. |
| `consumption` | object | Sense Guard only: consumption summary (`daily_consumption`, `daily_cost`, `average_daily_consumption`, `average_monthly_consumption`) from `details.data_latest`. |
| `notifications` | array | Active notifications, each annotated with a human-readable `category` and `message`. |
| `command` | object | Only for Sense Guard: the current command state (e.g. `valve_open`). |
| `measurements` | array | Per-period historical readings from the aggregated response — only when `payload.data` was specified (defaults to `[]`). See *Historical data* below. |
| `withdrawals` | array | Per-event historical water draws from the aggregated response — only when `payload.data` was specified (defaults to `[]`). See *Historical data* below. |
| `data` | object | Raw aggregated historical data (the full inner content) — only when `payload.data` was specified. Kept for backward compatibility. |
| `statistics` | object | Pre-computed min/max temperature, humidity, pressure, flow rate, and today/total water consumption derived from `data`. |

### Historical data (measurements & withdrawals)
When the input carries a `payload.data` range, the node calls the aggregated-data endpoint and surfaces its two arrays directly on the output:

```
GET …/appliances/{applianceId}/data/aggregated?from=2026-06-01&to=2026-06-28&groupBy=hour
```

- **`groupBy`** buckets the data by `hour`, `day`, `week`, `month`, or `year`. The API expects these in **lower case**; the node accepts any casing on input and lower-cases it before the call. `hour` is the finest granularity — there is no minute-level option. An unrecognized value is rejected (logged) and falls back to `day`.
- **`msg.payload.measurements`** — per-period readings. Fields (snake_case, as sent by the API): `date`, `timestamp`, `flowrate`, `pressure`, `temperature`, `temperature_guard`, `humidity`, `battery` (Blue/filter appliances may add `remaining_filter`, `remaining_co2`, `date_of_filter_replacement`, `date_of_co2_replacement`, `date_of_cleaning`). Absent fields are simply omitted by the appliance.
- **`msg.payload.withdrawals`** — per-event water draws, in one of two shapes (detect by the keys present):
  - per-event draw: `{ starttime, stoptime, waterconsumption, maxflowrate }`
  - per-period cost summary: `{ date, waterconsumption, water_cost, energy_cost, hotwater_share }`
- **`msg.payload.data`** still contains the full raw aggregated response for backward compatibility.

Both arrays default to `[]` when the appliance returns none. See the example flow [**senseguardaggregateddata**](examples/senseguardaggregateddata.json).

### Status indicator
The node icon reflects the runtime state: *connecting*, *connected*, *updating*, *ok*, *N notifications*, *disconnected*, *&lt;name&gt; not found*, or *failed*. When the configuration node loses its connection the sense node shows *disconnected* and automatically returns to *connected* once the connection is re-established.


## Examples

### Sense
To get the status simply send any `msg.payload` to the input.

See the example flow [**sense**](examples/sense.json) in the examples folder.


### Sense Guard
To open the valve send:
```js
msg.payload = {
    command : {
        valve_open: true,
    }
};
```

See the example flow [**sense guard**](examples/senseguard.json) in the examples folder.


### Getting Historical Data
To read out the internal measurement history you need to specify the start and end date as follows:
```js
let end = new Date();
let start = new Date();
start.setDate(end.getDate() - 2); // last 2 days.

msg.payload = {
    data : {
        from : start,
        to : end,
        groupBy : 'hour' // or 'day', 'week', ...
    }
};
```
Dates can be passed in milliseconds format, too:
```js
let now = Date.now();
msg.payload = {
    data : {
        from : now - 24 * 60 * 60000,
        to : now,
        groupBy : 'hour'
    }
};
```

See the example flow [**sense guard last values**](examples/senseguardvalues.json) in the examples folder.  
See the example flow [**sense guard history**](examples/senseguardhistory.json) in the examples folder.  
  
See the example flow [**sense last values**](examples/sensevalues.json) in the examples folder.  
See the example flow [**sense history**](examples/sensehistory.json) in the examples folder.


# Development

```sh
npm install        # install dev dependencies
npm test           # run unit tests
npm run lint       # run eslint
```
Tests run automatically on every push and pull request via GitHub Actions (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).






# License

Author: Karl-Heinz Wind

The MIT License (MIT)
Copyright (c) 2022 by Karl-Heinz Wind

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
