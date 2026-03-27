/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns(
    "messages",
    {
      is_pinned: { type: "boolean", notNull: true, default: false },
      pinned_at: { type: "timestamptz" },
      pinned_by: {
        type: "integer",
        references: "users",
        onDelete: "SET NULL",
      },
    },
    { ifNotExists: true }
  );
  pgm.createIndex("messages", ["channel_id", "is_pinned", "created_at"], {
    name: "idx_messages_channel_pinned_created",
    ifNotExists: true,
  });
};

exports.down = () => {};
