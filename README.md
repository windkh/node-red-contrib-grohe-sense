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


# Grohe Sense Node
The node is able to get the status of a Grohe Sense, Grohe Plus or Grohe Guard node.


## Sense
To get the status simply send any msg.payload to the input.

See the example flow [**sense**](examples/sense.json) in the examples folder.



## Sense Guard
To get the status simply send any msg.payload to the input.
To send a command to open the valve you need to send the following message:
```
msg.payload = {  
    command : {
        valve_open: true,
    }
};
```

See the example flow [**sense guard**](examples/senseguard.json) in the examples folder.



## Getting Historical Data
To read out the internal measurement history you need to specify the start and end data as follows:
```
let end = new Date();
let start = new Date();
start.setDate(end.getDate() - 2); // last 2 days.

msg.payload = {  
    data : {
        from : start,
		to : end
    }
};
```
Date can be passed in milliseconds format, too: e.g. Date.now

```
let now = Date.now();
let end = now;
let start = now - 24 * 60 * 60000;

msg.payload = {
    data : {
        from : start,
        to : end
    }
}
```

See the example flow [**sense guard last values**](examples/senseguardvalues.json) in the examples folder.
See the example flow [**sense guard history**](examples/senseguardhistory.json) in the examples folder.

See the example flow [**sense last values**](examples/sensevalues.json) in the examples folder.
See the example flow [**sense history**](examples/sensehistory.json) in the examples folder.






# License

Author: Karl-Heinz Wind

The MIT License (MIT)
Copyright (c) 2022 by Karl-Heinz Wind

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
