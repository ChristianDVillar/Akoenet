const { appEvents } = require("./app-events");
const { indexMessageIfEnabled } = require("./elastic-index");
const { deliverMessageWebhooks } = require("./webhook-delivery");

function registerDomainHandlers() {
  appEvents.on("message.created", (payload) => {
    setImmediate(() => {
      indexMessageIfEnabled(payload).catch(() => {});
    });
    setImmediate(() => {
      deliverMessageWebhooks(payload).catch(() => {});
    });
  });
}

module.exports = { registerDomainHandlers };
