/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns(
    "users",
    {
      presence_status: { type: "text", notNull: true, default: "online" },
      custom_status: { type: "text" },
    },
    { ifNotExists: true }
  );
};

exports.down = () => {};
