/**
 * Lightweight in-process counters for admin observability (resets on deploy).
 * Not a replacement for Prometheus — complements /health and audit logs.
 */

const startedAt = Date.now();
let totalChannel = 0;
let totalDm = 0;
let windowStart = Date.now();
let windowChannel = 0;
let windowDm = 0;
const WINDOW_MS = 60_000;

function rollWindow() {
  const now = Date.now();
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    windowChannel = 0;
    windowDm = 0;
  }
}

function recordChannelMessage() {
  rollWindow();
  totalChannel += 1;
  windowChannel += 1;
}

function recordDmMessage() {
  rollWindow();
  totalDm += 1;
  windowDm += 1;
}

function getSnapshot() {
  rollWindow();
  return {
    process_started_at: new Date(startedAt).toISOString(),
    uptime_ms: Date.now() - startedAt,
    messages_total: {
      channel: totalChannel,
      dm: totalDm,
      combined: totalChannel + totalDm,
    },
    messages_last_60s: {
      channel: windowChannel,
      dm: windowDm,
      combined: windowChannel + windowDm,
    },
    rate_window: {
      started_at: new Date(windowStart).toISOString(),
      window_ms: WINDOW_MS,
    },
  };
}

module.exports = {
  recordChannelMessage,
  recordDmMessage,
  getSnapshot,
};
