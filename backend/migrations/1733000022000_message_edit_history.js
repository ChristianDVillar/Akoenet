/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("message_edit_history", {
    id: { type: "bigserial", primaryKey: true },
    message_id: {
      type: "bigint",
      references: "messages",
      onDelete: "cascade",
    },
    direct_message_id: {
      type: "bigint",
      references: "direct_messages",
      onDelete: "cascade",
    },
    old_content: { type: "text", notNull: true },
    new_content: { type: "text", notNull: true },
    edited_by: {
      type: "bigint",
      notNull: true,
      references: "users",
      onDelete: "restrict",
    },
    edited_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.sql(
    `ALTER TABLE message_edit_history
     ADD CONSTRAINT message_edit_history_target_check
     CHECK (
       (message_id IS NOT NULL AND direct_message_id IS NULL)
       OR (message_id IS NULL AND direct_message_id IS NOT NULL)
     )`
  );

  pgm.createIndex("message_edit_history", ["message_id", "edited_at"], {
    name: "message_edit_history_message_idx",
  });
  pgm.createIndex("message_edit_history", ["direct_message_id", "edited_at"], {
    name: "message_edit_history_dm_idx",
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("message_edit_history");
};
