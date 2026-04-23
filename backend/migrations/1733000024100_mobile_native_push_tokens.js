/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.alterColumn("push_subscriptions", "endpoint", { notNull: false });
  pgm.alterColumn("push_subscriptions", "p256dh", { notNull: false });
  pgm.alterColumn("push_subscriptions", "auth", { notNull: false });

  pgm.addColumns("push_subscriptions", {
    subscription_type: { type: "text", notNull: true, default: "web" },
    native_platform: { type: "text" },
    native_token: { type: "text" },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.sql(
    "ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_type_check CHECK (subscription_type IN ('web','native'))"
  );
  pgm.sql(
    "ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_native_platform_check CHECK (native_platform IS NULL OR native_platform IN ('android','ios'))"
  );

  pgm.createIndex("push_subscriptions", ["user_id", "subscription_type"], {
    name: "push_subscriptions_user_type_idx",
  });
  pgm.createIndex("push_subscriptions", ["user_id", "native_platform"], {
    name: "push_subscriptions_user_native_platform_idx",
    where: "subscription_type = 'native'",
  });
  pgm.createIndex("push_subscriptions", ["native_token"], {
    name: "push_subscriptions_native_token_idx",
    unique: true,
    where: "native_token IS NOT NULL",
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex("push_subscriptions", [], {
    name: "push_subscriptions_native_token_idx",
    ifExists: true,
  });
  pgm.dropIndex("push_subscriptions", [], {
    name: "push_subscriptions_user_native_platform_idx",
    ifExists: true,
  });
  pgm.dropIndex("push_subscriptions", [], {
    name: "push_subscriptions_user_type_idx",
    ifExists: true,
  });
  pgm.sql("ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_native_platform_check");
  pgm.sql("ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_type_check");
  pgm.dropColumns("push_subscriptions", [
    "subscription_type",
    "native_platform",
    "native_token",
    "updated_at",
  ]);
  pgm.alterColumn("push_subscriptions", "endpoint", { notNull: true });
  pgm.alterColumn("push_subscriptions", "p256dh", { notNull: true });
  pgm.alterColumn("push_subscriptions", "auth", { notNull: true });
};
