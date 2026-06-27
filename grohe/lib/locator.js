'use strict';

// Resolves the location / room / appliance ids for a given room + appliance name.
// Appliances are matched by their exact name (as shown in the Grohe Ondus app).
//
// On success returns:
//   { ids: { locationId, roomId, applianceId }, registrationComplete: boolean }
// On failure returns a diagnostic object so the caller can tell the user what is
// actually available instead of a cryptic timeout / "not found":
//   { error: 'roomNotFound', availableRooms: [...] }
//   { error: 'applianceNotFound', availableRooms: [...], availableAppliances: [...] }
// (#25)
function findApplianceIds(location, appliancesByRoomName, roomName, applianceName) {
    let availableRooms = Object.keys(appliancesByRoomName || {});

    let entry = (appliancesByRoomName || {})[roomName];
    if (entry === undefined) {
        return {
            error: 'roomNotFound',
            availableRooms: availableRooms,
        };
    }

    let appliances = entry.appliances || [];
    let room = entry.room || {};

    for (let i = 0; i < appliances.length; i++) {
        let appliance = appliances[i];

        if (appliance.name === applianceName) {
            return {
                ids: {
                    locationId: location.id,
                    roomId: room.id,
                    applianceId: appliance.appliance_id,
                },
                // Stale / not fully registered appliances still resolve but their
                // commands typically time out, so flag them for the caller.
                registrationComplete: appliance.registration_complete !== false,
            };
        }
    }

    return {
        error: 'applianceNotFound',
        availableRooms: availableRooms,
        availableAppliances: appliances.map(function (a) { return a.name; }),
    };
}

module.exports = {
    findApplianceIds,
};
