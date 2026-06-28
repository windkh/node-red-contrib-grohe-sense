# Changelog
All notable changes to this project will be documented in this file.

## [0.33.0] [2026-06-28]
### fully exposed the Sense Guard appliance command: msg.payload.command now accepts the whole documented field set (valve_open, measure_now, pressure_measurement_running, buzzer_on, buzzer_sound_profile, ...), validated and whitelisted; fixed the bug where the entire msg.payload was posted as the command body - the node now builds a correct ApplianceCommand wrapper ({ appliance_id, type, command }, plus optional commandb64) via new ondusApi buildApplianceCommand / sendApplianceCommand helpers; wrong value types are rejected without a POST; the api validates the whole command object, so the node reads the current command and merges the requested change before sending (a partial command like { measure_now: true } no longer fails with Bad Request); added a command example flow and tests

## [0.32.0] [2026-06-28]
### surfaced the aggregated-data arrays as msg.payload.measurements (per-period readings) and msg.payload.withdrawals (per-event draws, both shapes handled), keeping the raw response on msg.payload.data; groupBy is restricted to hour | day | week | month | year (sent in lower case as the api requires, input accepted in any case, falls back to day); errors now include the server response body; added a converters.extractAggregated helper, an aggregated-data example flow, and tests

## [0.31.0] [2026-06-27]
### the location node now keeps retrying login with exponential backoff (5s..60s) when the internet is unavailable at startup or the connection is later lost (incl. a failed token refresh), and recovers automatically; sense nodes show 'disconnected' and reconnect without stacking duplicate input handlers; added connection log messages - [#20](https://github.com/windkh/node-red-contrib-grohe-sense/issues/20)

## [0.30.0] [2026-06-27]
### improved appliance lookup diagnostics: room / appliance names are now matched via a unit-tested lib/locator helper that, on mismatch, reports the available names; the node warns when a matched appliance is not fully registered (stale appliances cause command timeouts); location name is trimmed - [#25](https://github.com/windkh/node-red-contrib-grohe-sense/issues/25)

## [0.29.0] [2026-06-27]
### adapted to the changed Sense Guard api: surfaced details.data_latest withdrawal + consumption summary as msg.payload.withdrawal / msg.payload.consumption, fixed convertWithdrawals to read the renamed max_flowrate field, updated the senseguardvalues example to use the live measurement, and added a fixture-backed test - [#26](https://github.com/windkh/node-red-contrib-grohe-sense/issues/26)

## [0.28.0] [2026-06-27]
### exposed the latest Sense reading (details.data_latest.measurement) as msg.payload.measurement and added a fixture-backed test for the changed Sense api - [#27](https://github.com/windkh/node-red-contrib-grohe-sense/issues/27)

## [0.27.0] [2026-05-16]
### moved lib/ and nodes/ folders under grohe/ to keep the node-red package self-contained

## [0.26.0] [2026-05-16]
### added ESLint configuration and `npm run lint` script; CI now runs lint before tests; minor cleanups in lib/ondusApi.js (removed dead url require / unused locals, tightened == to ===)

## [0.25.0] [2026-05-16]
### added GitHub Actions CI workflow that runs the test suite on every push / PR against main (node 18/20/22); existing publish workflow now runs tests too

## [0.24.0] [2026-05-16]
### added mocha unit tests for converters, ondusApi notification mapping, and entry-point registration

## [0.23.0] [2026-05-16]
### documented inputs / outputs of the sense node in 99-grohe.html and README; documented project layout

## [0.22.0] [2026-05-16]
### refactored 99-grohe.js: GroheLocationNode and GroheSenseNode moved into nodes/ folder; conversion helpers moved into lib/converters.js

## [0.21.0] [2026-05-16]
### moved ondusApi.js into the dedicated lib/ folder

## [0.20.1] [2024-07-13]
### refresh token does not crash when internet is temporarily unavailable - [#18](https://github.com/windkh/node-red-contrib-grohe-sense/issues/18) 

## [0.20.0] [2024-06-05]
### adapted to changes in ondus API
- timestamp is now date
- maxFlowrate was removed
- withdrawals are not available in the format starttime/endtime but only per time period

## [0.19.0] [2023-11-14]
### added details - [#16](https://github.com/windkh/node-red-contrib-grohe-sense/issues/16) 

## [0.18.0] [2023-09-25]
### fixed statistics for today - [#13](https://github.com/windkh/node-red-contrib-grohe-sense/issues/13) 

## [0.17.0] [2023-09-24]
### fixed examples and added groupBy option - [#13](https://github.com/windkh/node-red-contrib-grohe-sense/issues/13) 

## [0.16.0] [2023-09-15]
### breaking change in API: data is now data/aggregated - [#12](https://github.com/windkh/node-red-contrib-grohe-sense/issues/12) 

## [0.15.1] [2023-03-17]
### fixed - [#11](https://github.com/windkh/node-red-contrib-grohe-sense/issues/11) 

## [0.15.0] [2022-11-21]
### added more statistics to history data

## [0.14.0] [2022-11-20]
### added statistics for measurements and withdrawals - [#3](https://github.com/windkh/node-red-contrib-grohe-sense/issues/3) 
### improved readability of notifications - [#4](https://github.com/windkh/node-red-contrib-grohe-sense/issues/4) 

## [0.13.0] [2022-11-20]
### fixed timestamp when getting appliance data - [#10](https://github.com/windkh/node-red-contrib-grohe-sense/issues/10) 

## [0.12.0] [2022-11-11]
### fixed - [#9](https://github.com/windkh/node-red-contrib-grohe-sense/issues/9) 

## [0.11.0] [2022-09-03]
### fixed - [#7](https://github.com/windkh/node-red-contrib-grohe-sense/issues/7) 

## [0.10.0] [2022-08-28]
### fixed - [#6](https://github.com/windkh/node-red-contrib-grohe-sense/issues/6) 

## [0.9.0] [2022-07-18]
### fixed - [#5](https://github.com/windkh/node-red-contrib-grohe-sense/issues/5) 

## [0.8.0] [2022-05-21]
### fixed - [#2](https://github.com/windkh/node-red-contrib-grohe-sense/issues/2) 

## [0.7.0] [2022-04-04]
### historical data can be read out now: see examples

## [0.6.2] [2022-02-19]
### updated icon

## [0.6.1] [2022-02-18]
### improved error handling

## [0.6.0] [2022-02-17]
### fixed - [#1](https://github.com/windkh/node-red-contrib-grohe-sense/issues/1) 

## [0.5.4] [2022-02-13]
### removed version info

## [0.5.3]
### allowed node-red 1.3.7 and nodejs 12.0.0

## [0.5.2]
### allowed node-red 1.0 and nodejs 10.0

## [0.5.1]
### automated publish

## [0.5.0]
### bugfix

## [0.4.1]
### added missing node red tags

## [0.4.0]
### Support for sending commands to sense guard

## [0.3.0]
### Added support for getting values

## [0.1.0]
### Initial version

**Note:** The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
