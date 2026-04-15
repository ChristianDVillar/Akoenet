/** Built-in `!` commands handled elsewhere (Scheduler integration). */
const RESERVED_COMMANDS = new Set(["schedule", "next"]);
const CUSTOM_COMMAND_ACTION_TYPES = new Set(["none", "ban"]);

/**
 * @param {string} text
 * @returns {{ name: string, argsText: string } | null}
 */
function parseServerCustomCommandText(text) {
  const t = String(text || "").trim();
  const m = t.match(/^!([a-zA-Z0-9_]{2,32})(?:\s+(.*))?$/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (RESERVED_COMMANDS.has(name)) return null;
  const argsText = String(m[2] || "").trim();
  return { name, argsText };
}

function isReservedServerCommandName(name) {
  return RESERVED_COMMANDS.has(String(name || "").toLowerCase());
}

function normalizeCustomCommandActionType(value) {
  const actionType = String(value || "none")
    .trim()
    .toLowerCase();
  return CUSTOM_COMMAND_ACTION_TYPES.has(actionType) ? actionType : "none";
}

function extractFirstCommandArg(argsText) {
  const arg = String(argsText || "")
    .trim()
    .split(/\s+/)[0];
  return arg ? arg.trim() : "";
}

/**
 * Replaces supported Nightbot-style variables in custom command replies.
 * Supported: $(user), $(args), $(target), $(target_id)
 */
function applyCustomCommandTemplate(template, context = {}) {
  const text = String(template || "");
  const dict = {
    user: String(context.user || ""),
    args: String(context.args || ""),
    target: String(context.target || ""),
    target_id: String(context.targetId || ""),
  };
  return text.replace(/\$\((user|args|target|target_id)\)/gi, (_, token) => dict[token.toLowerCase()] || "");
}

module.exports = {
  applyCustomCommandTemplate,
  extractFirstCommandArg,
  normalizeCustomCommandActionType,
  parseServerCustomCommandText,
  isReservedServerCommandName,
  CUSTOM_COMMAND_ACTION_TYPES,
  RESERVED_COMMANDS,
};
