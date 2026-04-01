/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("refresh_tokens", {
    id: { type: "bigserial", primaryKey: true },
    user_id: {
      type: "bigint",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    token_hash: { type: "text", notNull: true, unique: true },
    expires_at: { type: "timestamptz", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
    revoked_at: { type: "timestamptz" },
  });
  pgm.createIndex("refresh_tokens", ["user_id"], {
    name: "refresh_tokens_user_active_idx",
    where: "revoked_at IS NULL",
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("refresh_tokens");
};
