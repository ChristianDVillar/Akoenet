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

CREATE TABLE channels (
  id SERIAL PRIMARY KEY,
  server_id INT NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  created_at TIMESTAMPTZ DEFAULT NOW()
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
CREATE INDEX idx_server_members_user ON server_members (user_id);
CREATE INDEX idx_server_members_server ON server_members (server_id);
