exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("channels", {
    is_private: { type: "boolean", notNull: true, default: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("channels", "is_private");
};

