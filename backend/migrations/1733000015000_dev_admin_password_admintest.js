/* eslint-disable camelcase */
/**
 * Sets bcrypt password for the dev-seeded admin (christiandvillar@gmail.com) to: AdminTest
 * Only affects rows with that email; safe no-op if user does not exist.
 */

exports.shorthands = undefined;

const HASH = "$2a$10$cf.pd6GsI0AN.AXOYCyOKeWbU8a/hshcRFmhBo5zTVA1YYn8QwidW";

exports.up = (pgm) => {
  pgm.sql(`
    UPDATE users
    SET password = '${HASH}'
    WHERE LOWER(email) = LOWER('christiandvillar@gmail.com');
  `);
};

exports.down = () => {
  // Previous hash not restored (dev-only convenience migration).
};
