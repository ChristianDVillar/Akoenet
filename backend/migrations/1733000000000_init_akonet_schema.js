/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    "users",
    {
      id: "id",
      username: { type: "text", notNull: true },
      email: { type: "text", notNull: true, unique: true },
      password: { type: "text", notNull: true },
      avatar_url: { type: "text" },
      created_at: { type: "timestamptz", default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    "servers",
    {
      id: "id",
      name: { type: "text", notNull: true },
      owner_id: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      is_system: { type: "boolean", notNull: true, default: false },
      created_at: { type: "timestamptz", default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    "server_members",
    {
      id: "id",
      user_id: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      server_id: {
        type: "integer",
        notNull: true,
        references: "servers",
        onDelete: "CASCADE",
      },
      joined_at: { type: "timestamptz", default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'server_members_user_server_unique'
      ) THEN
        ALTER TABLE "server_members"
        ADD CONSTRAINT "server_members_user_server_unique" UNIQUE ("user_id", "server_id");
      END IF;
    END $$;
  `);

  pgm.createTable(
    "roles",
    {
      id: "id",
      server_id: {
        type: "integer",
        notNull: true,
        references: "servers",
        onDelete: "CASCADE",
      },
      name: { type: "text", notNull: true },
    },
    { ifNotExists: true }
  );
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'roles_server_name_unique'
      ) THEN
        ALTER TABLE "roles"
        ADD CONSTRAINT "roles_server_name_unique" UNIQUE ("server_id", "name");
      END IF;
    END $$;
  `);

  pgm.createTable(
    "user_roles",
    {
      user_id: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      role_id: {
        type: "integer",
        notNull: true,
        references: "roles",
        onDelete: "CASCADE",
      },
    },
    { ifNotExists: true }
  );
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'user_roles'::regclass
          AND contype = 'p'
      ) THEN
        ALTER TABLE "user_roles"
        ADD CONSTRAINT "user_roles_pk" PRIMARY KEY ("user_id", "role_id");
      END IF;
    END $$;
  `);

  pgm.createTable(
    "channel_categories",
    {
      id: "id",
      server_id: {
        type: "integer",
        notNull: true,
        references: "servers",
        onDelete: "CASCADE",
      },
      name: { type: "text", notNull: true },
      position: { type: "integer", notNull: true, default: 0 },
      created_at: { type: "timestamptz", default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    "channels",
    {
      id: "id",
      server_id: {
        type: "integer",
        notNull: true,
        references: "servers",
        onDelete: "CASCADE",
      },
      category_id: {
        type: "integer",
        references: "channel_categories",
        onDelete: "SET NULL",
      },
      name: { type: "text", notNull: true },
      type: { type: "text", notNull: true, default: "text" },
      position: { type: "integer", notNull: true, default: 0 },
      created_at: { type: "timestamptz", default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    "channel_permissions",
    {
      channel_id: {
        type: "integer",
        notNull: true,
        references: "channels",
        onDelete: "CASCADE",
      },
      role_id: {
        type: "integer",
        notNull: true,
        references: "roles",
        onDelete: "CASCADE",
      },
      can_view: { type: "boolean", notNull: true, default: true },
      can_send: { type: "boolean", notNull: true, default: true },
      can_connect: { type: "boolean", notNull: true, default: true },
    },
    { ifNotExists: true }
  );
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'channel_permissions'::regclass
          AND contype = 'p'
      ) THEN
        ALTER TABLE "channel_permissions"
        ADD CONSTRAINT "channel_permissions_pk" PRIMARY KEY ("channel_id", "role_id");
      END IF;
    END $$;
  `);

  pgm.createTable(
    "channel_user_permissions",
    {
      channel_id: {
        type: "integer",
        notNull: true,
        references: "channels",
        onDelete: "CASCADE",
      },
      user_id: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      can_view: { type: "boolean", notNull: true, default: true },
      can_send: { type: "boolean", notNull: true, default: true },
      can_connect: { type: "boolean", notNull: true, default: true },
    },
    { ifNotExists: true }
  );
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'channel_user_permissions'::regclass
          AND contype = 'p'
      ) THEN
        ALTER TABLE "channel_user_permissions"
        ADD CONSTRAINT "channel_user_permissions_pk" PRIMARY KEY ("channel_id", "user_id");
      END IF;
    END $$;
  `);

  pgm.createTable(
    "messages",
    {
      id: "id",
      channel_id: {
        type: "integer",
        notNull: true,
        references: "channels",
        onDelete: "CASCADE",
      },
      user_id: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      content: { type: "text", notNull: true, default: "" },
      image_url: { type: "text" },
      created_at: { type: "timestamptz", default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    "direct_conversations",
    {
      id: "id",
      user_low_id: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      user_high_id: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      created_at: { type: "timestamptz", default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'direct_conversations_pair_unique'
      ) THEN
        ALTER TABLE "direct_conversations"
        ADD CONSTRAINT "direct_conversations_pair_unique" UNIQUE ("user_low_id", "user_high_id");
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'direct_conversations_pair_order_check'
      ) THEN
        ALTER TABLE "direct_conversations"
        ADD CONSTRAINT "direct_conversations_pair_order_check" CHECK (user_low_id < user_high_id);
      END IF;
    END $$;
  `);

  pgm.createTable(
    "direct_messages",
    {
      id: "id",
      conversation_id: {
        type: "integer",
        notNull: true,
        references: "direct_conversations",
        onDelete: "CASCADE",
      },
      sender_id: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      content: { type: "text", notNull: true },
      image_url: { type: "text" },
      created_at: { type: "timestamptz", default: pgm.func("now()") },
    },
    { ifNotExists: true }
  );

  pgm.createIndex("messages", ["channel_id", "created_at"], {
    name: "idx_messages_channel",
    ifNotExists: true,
  });
  pgm.createIndex("channels", "server_id", {
    name: "idx_channels_server",
    ifNotExists: true,
  });
  pgm.createIndex("channels", "category_id", {
    name: "idx_channels_category",
    ifNotExists: true,
  });
  pgm.createIndex("server_members", "user_id", {
    name: "idx_server_members_user",
    ifNotExists: true,
  });
  pgm.createIndex("server_members", "server_id", {
    name: "idx_server_members_server",
    ifNotExists: true,
  });
  pgm.createIndex("direct_messages", ["conversation_id", "created_at"], {
    name: "idx_direct_messages_conversation",
    ifNotExists: true,
  });
};

exports.down = () => {};
