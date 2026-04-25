/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns("push_subscriptions", {
    device_id: { type: "text" },
    device_name: { type: "text" },
    app_version: { type: "text" },
    last_seen_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.createIndex("push_subscriptions", ["user_id", "native_platform", "device_id"], {
    name: "push_subscriptions_native_device_unique_idx",
    unique: true,
    where: "subscription_type = 'native' AND device_id IS NOT NULL",
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex("push_subscriptions", [], {
    name: "push_subscriptions_native_device_unique_idx",
    ifExists: true,
  });
  pgm.dropColumns("push_subscriptions", ["device_id", "device_name", "app_version", "last_seen_at"]);
};
