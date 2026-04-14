/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable(
    "role_server_permissions",
    {
      role_id: {
        type: "integer",
        notNull: true,
        references: "roles",
        onDelete: "CASCADE",
      },
      permission_key: { type: "text", notNull: true },
    },
    {
      ifNotExists: true,
      constraints: { primaryKey: ["role_id", "permission_key"] },
    }
  );

  pgm.sql(`
    INSERT INTO role_server_permissions (role_id, permission_key)
    SELECT r.id, 'server_admin'
    FROM roles r
    WHERE r.slug = 'admin'
    ON CONFLICT DO NOTHING;

    INSERT INTO role_server_permissions (role_id, permission_key)
    SELECT r.id, v.k
    FROM roles r
    CROSS JOIN (VALUES
      ('manage_channels'),
      ('manage_invites'),
      ('manage_emojis'),
      ('access_private_default'),
      ('manage_messages')
    ) AS v(k)
    WHERE r.slug = 'moderator'
    ON CONFLICT DO NOTHING;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("role_server_permissions", { ifExists: true });
};
