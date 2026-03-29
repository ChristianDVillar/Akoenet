/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("users", { is_admin: { type: "boolean", notNull: true, default: false } }, { ifNotExists: true });

  // Skip seed admin on hosted DBs (e.g. Supabase). Set ADMIN_BOOTSTRAP_EMAIL + ADMIN_BOOTSTRAP_PASSWORD_HASH to seed.
  if (process.env.SKIP_ADMIN_BOOTSTRAP === "1") {
    return;
  }
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const hash = process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH;
  if (email && hash) {
    const u =
      (process.env.ADMIN_BOOTSTRAP_USERNAME || "admin").replace(/[^a-zA-Z0-9._-]/g, "") ||
      "admin";
    pgm.sql(`
      INSERT INTO users (username, email, password, is_admin)
      VALUES ('${u.replace(/'/g, "''")}', '${email.replace(/'/g, "''")}', '${hash.replace(/'/g, "''")}', true)
      ON CONFLICT (email)
      DO UPDATE SET password = EXCLUDED.password, is_admin = true;
    `);
    return;
  }

  pgm.sql(`
    INSERT INTO users (username, email, password, is_admin)
    VALUES ('christiandvillar', 'christiandvillar@gmail.com', '$2a$10$/R8XCiIYnvMzdyivpXZbDe451cpBjZM0Y5.VU39wHUvAZGdpUv8EG', true)
    ON CONFLICT (email)
    DO UPDATE SET
      password = EXCLUDED.password,
      is_admin = true;
  `);
};

exports.down = () => {};
