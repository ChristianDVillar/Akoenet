/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    "server_custom_commands",
    {
      id: "id",
      server_id: {
        type: "integer",
        notNull: true,
        references: "servers",
        onDelete: "CASCADE",
      },
      command_name: { type: "text", notNull: true },
      response: { type: "text", notNull: true },
      created_by: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
      updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );
  pgm.createIndex("server_custom_commands", ["server_id", "command_name"], {
    name: "idx_server_custom_commands_server_name_unique",
    unique: true,
    ifNotExists: true,
  });
  pgm.createIndex("server_custom_commands", "server_id", {
    name: "idx_server_custom_commands_server",
    ifNotExists: true,
  });

  pgm.createTable(
    "server_calendar_events",
    {
      id: "id",
      server_id: {
        type: "integer",
        notNull: true,
        references: "servers",
        onDelete: "CASCADE",
      },
      title: { type: "text", notNull: true },
      description: { type: "text", notNull: false },
      starts_at: { type: "timestamptz", notNull: true },
      ends_at: { type: "timestamptz", notNull: false },
      created_by: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );
  pgm.createIndex("server_calendar_events", ["server_id", "starts_at"], {
    name: "idx_server_calendar_events_server_starts",
    ifNotExists: true,
  });

  pgm.createTable(
    "server_announcements",
    {
      id: "id",
      server_id: {
        type: "integer",
        notNull: true,
        references: "servers",
        onDelete: "CASCADE",
      },
      title: { type: "text", notNull: true },
      body: { type: "text", notNull: true },
      created_by: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );
  pgm.createIndex("server_announcements", "server_id", {
    name: "idx_server_announcements_server",
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropTable("server_announcements", { ifExists: true });
  pgm.dropTable("server_calendar_events", { ifExists: true });
  pgm.dropTable("server_custom_commands", { ifExists: true });
};
