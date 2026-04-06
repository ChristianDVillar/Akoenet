/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns("users", {
    terms_version: { type: "text" },
    terms_accepted_at: { type: "timestamptz" },
  });
  pgm.createTable("legal_terms_acceptances", {
    id: { type: "serial", primaryKey: true },
    user_id: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    terms_version: { type: "text", notNull: true },
    accepted_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.createIndex("legal_terms_acceptances", "user_id", {
    name: "legal_terms_acceptances_user_id_idx",
  });
  pgm.sql(`
    UPDATE users
    SET terms_version = '1',
        terms_accepted_at = COALESCE(created_at, NOW())
    WHERE terms_accepted_at IS NULL;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("legal_terms_acceptances");
  pgm.dropColumns("users", ["terms_version", "terms_accepted_at"]);
};
