/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    "message_reactions",
    {
      id: "id",
      message_id: {
        type: "integer",
        notNull: true,
        references: "messages",
        onDelete: "CASCADE",
      },
      user_id: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      reaction_key: { type: "text", notNull: true },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );
  pgm.createConstraint("message_reactions", "message_reactions_unique_user_key", {
    unique: ["message_id", "user_id", "reaction_key"],
  });
  pgm.createIndex("message_reactions", "message_id", {
    name: "idx_message_reactions_message",
    ifNotExists: true,
  });
  pgm.createIndex("message_reactions", ["message_id", "reaction_key"], {
    name: "idx_message_reactions_message_key",
    ifNotExists: true,
  });

  pgm.createTable(
    "admin_audit_logs",
    {
      id: "id",
      actor_user_id: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      action: { type: "text", notNull: true },
      target_message_id: {
        type: "integer",
        references: "messages",
        onDelete: "SET NULL",
      },
      channel_id: {
        type: "integer",
        references: "channels",
        onDelete: "SET NULL",
      },
      server_id: {
        type: "integer",
        references: "servers",
        onDelete: "SET NULL",
      },
      metadata: { type: "jsonb", notNull: true, default: "{}" },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );
  pgm.createIndex("admin_audit_logs", "created_at", {
    name: "idx_admin_audit_logs_created",
    ifNotExists: true,
  });
  pgm.createIndex("admin_audit_logs", "server_id", {
    name: "idx_admin_audit_logs_server",
    ifNotExists: true,
  });
};

exports.down = () => {};
