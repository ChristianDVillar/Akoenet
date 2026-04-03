/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("registration_tokens", {
    id: { type: "bigserial", primaryKey: true },
    email_norm: { type: "text", notNull: true },
    token_hash: { type: "text", notNull: true, unique: true },
    invite_token: { type: "text" },
    expires_at: { type: "timestamptz", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.createIndex("registration_tokens", ["email_norm"], { name: "registration_tokens_email_idx" });
  pgm.createIndex("registration_tokens", ["expires_at"], { name: "registration_tokens_expires_idx" });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("registration_tokens");
};
