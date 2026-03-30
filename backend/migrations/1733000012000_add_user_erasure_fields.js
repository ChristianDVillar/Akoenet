/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("users", {
    deleted_at: { type: "timestamptz" },
    erased_at: { type: "timestamptz" },
    deletion_reason: { type: "text" },
  });
  pgm.createIndex("users", "deleted_at", {
    name: "idx_users_deleted_at",
    ifNotExists: true,
  });
};

exports.down = () => {};
