/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    "server_invites",
    {
      id: "id",
      server_id: {
        type: "integer",
        notNull: true,
        references: "servers",
        onDelete: "CASCADE",
      },
      created_by: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      token: { type: "text", notNull: true, unique: true },
      max_uses: { type: "integer" },
      used_count: { type: "integer", notNull: true, default: 0 },
      expires_at: { type: "timestamptz" },
      is_active: { type: "boolean", notNull: true, default: true },
      created_at: { type: "timestamptz", default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.createIndex("server_invites", "server_id", {
    name: "idx_server_invites_server",
    ifNotExists: true,
  });
  pgm.createIndex("server_invites", "token", {
    name: "idx_server_invites_token",
    ifNotExists: true,
  });
};

exports.down = () => {};
