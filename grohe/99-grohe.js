/**
 * Entry point that registers the Grohe Sense nodes.
 * The individual node implementations live in the nodes/ folder.
 * Created by Karl-Heinz Wind
 */

'use strict';

module.exports = function (RED) {
    const pkg = require('./../package.json');
    RED.log.info('node-red-contrib-grohe-sense version: v' + pkg.version);

    require('../nodes/grohe-location-node.js')(RED);
    require('../nodes/grohe-sense-node.js')(RED);
};
