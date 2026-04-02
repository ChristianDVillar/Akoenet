/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("server_bans", {
    id: { type: "bigserial", primaryKey: true },
    server_id: {
      type: "bigint",
      notNull: true,
      references: "servers",
      onDelete: "cascade",
    },
    user_id: {
      type: "bigint",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    reason: { type: "text" },
    banned_by: {
      type: "bigint",
      notNull: true,
      references: "users",
      onDelete: "restrict",
    },
    expires_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
    revoked_at: { type: "timestamptz" },
    revoked_by: {
      type: "bigint",
      references: "users",
      onDelete: "set null",
    },
  });

  pgm.createIndex("server_bans", ["server_id", "user_id"], {
    name: "server_bans_server_user_idx",
  });
  pgm.createIndex("server_bans", ["server_id", "revoked_at", "expires_at"], {
    name: "server_bans_active_lookup_idx",
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("server_bans");
};
