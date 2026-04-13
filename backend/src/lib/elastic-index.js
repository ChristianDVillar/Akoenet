const pool = require("../config/db");
const logger = require("./logger");

const INDEX = process.env.ELASTICSEARCH_MESSAGES_INDEX || "akonet-messages";

function getClient() {
  const url = String(process.env.ELASTICSEARCH_URL || "").trim();
  if (!url) return null;
  try {
    const { Client } = require("@elastic/elasticsearch");
    return new Client({ node: url });
  } catch (e) {
    logger.warn({ err: e }, "Elasticsearch client unavailable");
    return null;
  }
}

let ensured;

async function ensureIndex(client) {
  if (ensured) return;
  try {
    await client.indices.create({
      index: INDEX,
      mappings: {
        properties: {
          message_id: { type: "long" },
          channel_id: { type: "long" },
          server_id: { type: "long" },
          user_id: { type: "long" },
          content: { type: "text" },
          created_at: { type: "date" },
        },
      },
    });
  } catch (e) {
    const msg = String(e?.meta?.body?.error?.type || e?.message || "");
    if (!msg.includes("resource_already_exists_exception") && !msg.includes("already_exists")) {
      throw e;
    }
  }
  ensured = true;
}

/**
 * @param {{ messageId: number, channelId: number, serverId: number, userId?: number }} payload
 */
async function indexMessageIfEnabled(payload) {
  const client = getClient();
  if (!client || !payload?.messageId) return;
  try {
    await ensureIndex(client);
    const row = await pool.query(
      `SELECT m.id, m.channel_id, m.user_id, m.content, m.created_at, c.server_id
       FROM messages m
       INNER JOIN channels c ON c.id = m.channel_id
       WHERE m.id = $1`,
      [payload.messageId]
    );
    if (!row.rows.length) return;
    const m = row.rows[0];
    await client.index({
      index: INDEX,
      id: String(m.id),
      document: {
        message_id: m.id,
        channel_id: m.channel_id,
        server_id: m.server_id,
        user_id: m.user_id,
        content: m.content || "",
        created_at: m.created_at,
      },
      refresh: false,
    });
  } catch (e) {
    logger.warn({ err: e, messageId: payload.messageId }, "elastic index failed");
  }
}

/**
 * @returns {Promise<number[] | null>} message ids or null to signal fallback
 */
async function searchGlobalElastic(channelIds, q, limit) {
  const client = getClient();
  if (!client || !channelIds.length || !q.trim()) return null;
  try {
    await ensureIndex(client);
    const result = await client.search({
      index: INDEX,
      size: limit,
      query: {
        bool: {
          must: [
            { simple_query_string: { query: q, fields: ["content"], default_operator: "and" } },
            { terms: { channel_id: channelIds } },
          ],
        },
      },
      sort: [{ created_at: "desc" }],
    });
    const hits = result.hits?.hits || [];
    return hits.map((h) => Number(h._source?.message_id || h._id)).filter((n) => Number.isFinite(n));
  } catch (e) {
    logger.warn({ err: e }, "elastic search failed; caller may fall back to PG");
    return null;
  }
}

module.exports = { indexMessageIfEnabled, searchGlobalElastic, INDEX };
