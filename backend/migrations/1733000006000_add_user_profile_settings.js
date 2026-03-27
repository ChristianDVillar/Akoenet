/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns(
    "users",
    {
      banner_url: { type: "text" },
      accent_color: { type: "text" },
      bio: { type: "text" },
    },
    { ifNotExists: true }
  );
};

exports.down = () => {};
