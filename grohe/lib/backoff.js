'use strict';

// Exponential backoff with a cap, used by the location node reconnect loop. (#20)
// attempt is 0-based: 0 -> baseMs, 1 -> 2*baseMs, 2 -> 4*baseMs, ... capped at maxMs.
function computeBackoffDelay(attempt, baseMs, maxMs) {
    if (!(attempt > 0)) { // also normalizes NaN / negative to 0
        attempt = 0;
    }

    let delay = baseMs * Math.pow(2, attempt);
    if (!(delay <= maxMs)) { // also catches Infinity from very large attempts
        delay = maxMs;
    }

    return delay;
}

module.exports = {
    computeBackoffDelay,
};
