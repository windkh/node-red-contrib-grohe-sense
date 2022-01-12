/**
* Created by Karl-Heinz Wind
**/

module.exports = function (RED) {
    "use strict";
    var axios = require('axios').default;
    
	
    // --------------------------------------------------------------------------------------------
    // The configuration node
    // holds the username and password
    // and establishes the connection to the server
    function GroheLocationNode(n) {
        RED.nodes.createNode(this, n);

        let self = this;

        this.config = n;

        // Reading configuration properties...
        this.location = n.location;
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
        node.room = config.room.trim();
		node.appliance = config.appliance.trim();

		// TODO: set status
		
        this.on('input', function (msg) {
            node.send([msg]);
        });

    }
    RED.nodes.registerType("grohe sense", GroheSenseNode);
}