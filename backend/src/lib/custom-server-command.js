/** Built-in `!` commands handled elsewhere (Scheduler integration). */
const RESERVED_COMMANDS = new Set(["schedule", "next"]);

/**
 * @param {string} text
 * @returns {{ name: string } | null}
 */
function parseServerCustomCommandText(text) {
  const t = String(text || "").trim();
  const m = t.match(/^!([a-zA-Z0-9_]{2,32})(\s|$)/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (RESERVED_COMMANDS.has(name)) return null;
  return { name };
}

function isReservedServerCommandName(name) {
  return RESERVED_COMMANDS.has(String(name || "").toLowerCase());
}

module.exports = {
  parseServerCustomCommandText,
  isReservedServerCommandName,
  RESERVED_COMMANDS,
};
