/* eslint-disable camelcase */
/**
 * Ensures dev admin exists (password bcrypt: AdminTest).
 * Use when DB has no row for christiandvillar@gmail.com (e.g. SKIP_ADMIN_BOOTSTRAP or empty DB).
 */

exports.shorthands = undefined;

const HASH = "$2a$10$cf.pd6GsI0AN.AXOYCyOKeWbU8a/hshcRFmhBo5zTVA1YYn8QwidW";

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO users (username, email, password, is_admin)
    VALUES (
      'christiandvillar',
      'christiandvillar@gmail.com',
      '${HASH}',
      true
    )
    ON CONFLICT (email) DO UPDATE SET
      password = EXCLUDED.password,
      is_admin = true,
      deleted_at = NULL,
      erased_at = NULL,
      deletion_reason = NULL;
  `);
};

exports.down = () => {};
