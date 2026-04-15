/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns(
    "server_custom_commands",
    {
      action_type: {
        type: "text",
        notNull: true,
        default: "none",
      },
      action_value: {
        type: "text",
        notNull: false,
      },
    },
    { ifNotExists: true }
  );
};

exports.down = (pgm) => {
  pgm.dropColumns("server_custom_commands", ["action_type", "action_value"], {
    ifExists: true,
  });
};
