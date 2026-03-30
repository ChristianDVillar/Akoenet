/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns("messages", {
    edited_at: { type: "timestamptz" },
    reply_to_id: {
      type: "integer",
      references: "messages",
      onDelete: "SET NULL",
    },
  });
  pgm.addColumns("direct_messages", {
    edited_at: { type: "timestamptz" },
    reply_to_id: {
      type: "integer",
      references: "direct_messages",
      onDelete: "SET NULL",
    },
  });
  pgm.createIndex("messages", "reply_to_id", {
    name: "idx_messages_reply_to_id",
    ifNotExists: true,
  });
  pgm.createIndex("direct_messages", "reply_to_id", {
    name: "idx_direct_messages_reply_to_id",
    ifNotExists: true,
  });
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_messages_content_fts
    ON messages USING gin (to_tsvector('simple', coalesce(content, '')));
  `);
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_direct_messages_content_fts
    ON direct_messages USING gin (to_tsvector('simple', coalesce(content, '')));
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_messages_content_fts;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_direct_messages_content_fts;`);
  pgm.dropIndex("messages", "reply_to_id", { name: "idx_messages_reply_to_id", ifExists: true });
  pgm.dropIndex("direct_messages", "reply_to_id", {
    name: "idx_direct_messages_reply_to_id",
    ifExists: true,
  });
  pgm.dropColumns("messages", ["edited_at", "reply_to_id"]);
  pgm.dropColumns("direct_messages", ["edited_at", "reply_to_id"]);
};
