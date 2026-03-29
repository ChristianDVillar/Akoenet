/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns(
    "users",
    {
      scheduler_streamer_username: {
        type: "text",
        comment:
          "Streamer Scheduler public slug (path /streamer/:slug). Used when Twitch login differs from Scheduler account username.",
      },
    },
    { ifNotExists: true }
  );
};

exports.down = (pgm) => {
  pgm.dropColumns("users", ["scheduler_streamer_username"], { ifExists: true });
};
