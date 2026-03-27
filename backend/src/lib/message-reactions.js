const pool = require("../config/db");

/**
 * @param {number[]} messageIds
 * @param {number} viewerUserId
 * @returns {Promise<Map<number, { key: string, count: number, reacted: boolean }[]>>}
 */
async function fetchReactionsByMessageIds(messageIds, viewerUserId) {
  const byMessage = new Map();
  if (!messageIds.length) return byMessage;
  const agg = await pool.query(
    `SELECT message_id,
            reaction_key,
            COUNT(*)::int AS count,
            BOOL_OR(user_id = $2) AS reacted
     FROM message_reactions
     WHERE message_id = ANY($1::int[])
     GROUP BY message_id, reaction_key
     ORDER BY message_id, reaction_key`,
    [messageIds, viewerUserId]
  );
  for (const row of agg.rows) {
    if (!byMessage.has(row.message_id)) byMessage.set(row.message_id, []);
    byMessage.get(row.message_id).push({
      key: row.reaction_key,
      count: Number(row.count),
      reacted: Boolean(row.reacted),
    });
  }
  return byMessage;
}

async function withReactionsOnMessages(messages, viewerUserId) {
  if (!messages.length) return messages;
  const ids = messages.map((m) => m.id);
  const byMessage = await fetchReactionsByMessageIds(ids, viewerUserId);
  return messages.map((m) => ({ ...m, reactions: byMessage.get(m.id) || [] }));
}

async function getMessageReactions(messageId, viewerUserId) {
  const byMessage = await fetchReactionsByMessageIds([messageId], viewerUserId);
  return byMessage.get(messageId) || [];
}

module.exports = {
  withReactionsOnMessages,
  getMessageReactions,
};
