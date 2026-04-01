/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns("users", {
    totp_secret: { type: "text" },
    totp_pending_secret: { type: "text" },
    totp_enabled: { type: "boolean", notNull: true, default: false },
    push_notifications_enabled: { type: "boolean", notNull: true, default: true },
  });

  pgm.createTable("push_subscriptions", {
    id: { type: "bigserial", primaryKey: true },
    user_id: {
      type: "bigint",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    endpoint: { type: "text", notNull: true },
    p256dh: { type: "text", notNull: true },
    auth: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("push_subscriptions", "push_subscriptions_user_endpoint_unique", {
    unique: ["user_id", "endpoint"],
  });

  pgm.createTable("user_friendships", {
    id: { type: "bigserial", primaryKey: true },
    requester_id: {
      type: "bigint",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    addressee_id: {
      type: "bigint",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    status: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("user_friendships", "user_friendships_pair_unique", {
    unique: ["requester_id", "addressee_id"],
  });
  pgm.createIndex("user_friendships", ["addressee_id", "status"], {
    name: "user_friendships_addressee_idx",
  });

  pgm.createTable("user_blocks", {
    blocker_id: {
      type: "bigint",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    blocked_id: {
      type: "bigint",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("user_blocks", "user_blocks_pk", {
    primaryKey: ["blocker_id", "blocked_id"],
  });
  pgm.sql(`ALTER TABLE user_blocks ADD CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)`);

  pgm.createTable("server_webhooks", {
    id: { type: "bigserial", primaryKey: true },
    server_id: {
      type: "bigint",
      notNull: true,
      references: "servers",
      onDelete: "cascade",
    },
    url: { type: "text", notNull: true },
    secret: { type: "text", notNull: true },
    event_types: { type: "text[]", notNull: true, default: "{message.create}" },
    created_by: { type: "bigint", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.createIndex("server_webhooks", ["server_id"], {
    name: "server_webhooks_server_idx",
  });

  pgm.addColumn("messages", "thread_root_message_id", {
    type: "bigint",
    references: "messages",
    onDelete: "set null",
  });
  pgm.createIndex("messages", ["thread_root_message_id"], {
    name: "messages_thread_root_idx",
    where: "thread_root_message_id IS NOT NULL",
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex("messages", [], { name: "messages_thread_root_idx", ifExists: true });
  pgm.dropColumn("messages", "thread_root_message_id");
  pgm.dropTable("server_webhooks");
  pgm.dropTable("user_blocks");
  pgm.dropTable("user_friendships");
  pgm.dropTable("push_subscriptions");
  pgm.dropColumns("users", [
    "totp_secret",
    "totp_pending_secret",
    "totp_enabled",
    "push_notifications_enabled",
  ]);
};
