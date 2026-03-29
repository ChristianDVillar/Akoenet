CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE servers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE server_members (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  server_id INT NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, server_id)
);

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  server_id INT NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (server_id, name)
);

CREATE TABLE user_roles (
  user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE channel_categories (
  id SERIAL PRIMARY KEY,
  server_id INT NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE channels (
  id SERIAL PRIMARY KEY,
  server_id INT NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
  category_id INT REFERENCES channel_categories (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  position INT NOT NULL DEFAULT 0,
  voice_user_limit INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE channel_permissions (
  channel_id INT NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_send BOOLEAN NOT NULL DEFAULT true,
  can_connect BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (channel_id, role_id)
);

CREATE TABLE channel_user_permissions (
  channel_id INT NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_send BOOLEAN NOT NULL DEFAULT true,
  can_connect BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  channel_id INT NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_channel ON messages (channel_id, created_at DESC);
CREATE INDEX idx_channels_server ON channels (server_id);
CREATE INDEX idx_channels_category ON channels (category_id);
CREATE INDEX idx_server_members_user ON server_members (user_id);
CREATE INDEX idx_server_members_server ON server_members (server_id);

CREATE TABLE direct_conversations (
  id SERIAL PRIMARY KEY,
  user_low_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_high_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_low_id, user_high_id),
  CHECK (user_low_id < user_high_id)
);

CREATE TABLE direct_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES direct_conversations (id) ON DELETE CASCADE,
  sender_id INT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_direct_messages_conversation ON direct_messages (conversation_id, created_at DESC);
