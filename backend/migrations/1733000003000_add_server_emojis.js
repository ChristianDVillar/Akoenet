/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    "server_emojis",
    {
      id: "id",
      server_id: {
        type: "integer",
        notNull: true,
        references: "servers",
        onDelete: "CASCADE",
      },
      name: { type: "text", notNull: true },
      image_url: { type: "text", notNull: true },
      created_by: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.createIndex("server_emojis", "server_id", {
    name: "idx_server_emojis_server",
    ifNotExists: true,
  });
  pgm.createIndex("server_emojis", ["server_id", "name"], {
    name: "idx_server_emojis_server_name_unique",
    unique: true,
    ifNotExists: true,
  });
};

exports.down = () => {};
