/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns(
    "users",
    {
      twitch_username: { type: "text", unique: true },
    },
    { ifNotExists: true }
  );
};

exports.down = (pgm) => {
  pgm.dropColumns("users", ["twitch_username"], { ifExists: true });
};
