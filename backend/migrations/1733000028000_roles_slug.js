/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns("roles", {
    slug: { type: "varchar(32)" },
  });
  pgm.sql(`
    UPDATE roles SET slug = LOWER(TRIM(name)) WHERE slug IS NULL;
  `);
  pgm.sql(`ALTER TABLE roles ALTER COLUMN slug SET NOT NULL`);
  pgm.addConstraint("roles", "roles_server_slug_unique", {
    unique: ["server_id", "slug"],
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropConstraint("roles", "roles_server_slug_unique");
  pgm.dropColumns("roles", ["slug"]);
};
