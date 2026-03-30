/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn(
    "users",
    {
      birth_date: { type: "date" },
    },
    { ifNotExists: true }
  );
};

exports.down = (pgm) => {
  pgm.dropColumns("users", ["birth_date"], { ifExists: true });
};
