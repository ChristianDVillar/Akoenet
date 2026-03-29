const EventEmitter = require("events");

/**
 * Internal domain event bus (extensible: analytics, integrations, metrics).
 * Emitted from sockets/routes without tight coupling between modules.
 */
const appEvents = new EventEmitter();
appEvents.setMaxListeners(50);

module.exports = { appEvents };
