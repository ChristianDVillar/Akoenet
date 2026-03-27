/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("users", { is_admin: { type: "boolean", notNull: true, default: false } }, { ifNotExists: true });

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
