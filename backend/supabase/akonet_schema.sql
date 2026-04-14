-- =============================================================================
-- AkoeNet — esquema público compatible con el backend (Express + JWT).
-- =============================================================================
-- Base de datos vacía (proyecto nuevo en Supabase o Postgres).
--
-- NO es intercambiable con esquemas genéricos "tipo Discord" que usan:
--   auth.users + auth_id, tabla invites, member_role enum, user_roles.server_id, etc.
-- El código en backend/ espera exactamente estas tablas y columnas (ver migrations/).
--
-- Formas de aplicar:
--   1) Recomendado: cd backend && npm run migrate  (DATABASE_URL a Supabase)
--   2) Pegar este script en Supabase → SQL → New query
--   3) Pegar después (mismo proyecto) el archivo storage_optional.sql si usarás Storage
--
-- Tras las tablas, este archivo registra tablas en Realtime (idempotente) y extensiones
-- opcionales. El backend conecta con la URL "Connection string" (rol postgres): no usa
-- RLS de Supabase Auth; no habilites RLS en public.* sin políticas completas o romperás
-- el acceso vía PostgREST si más adelante expones la API de Supabase al cliente.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

BEGIN;

CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  banner_url TEXT,
  accent_color TEXT,
  bio TEXT,
  presence_status TEXT NOT NULL DEFAULT 'online',
  custom_status TEXT
);

CREATE TABLE IF NOT EXISTS public.servers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.server_members (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  server_id INTEGER NOT NULL REFERENCES public.servers (id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT server_members_user_server_unique UNIQUE (user_id, server_id)
);

CREATE TABLE IF NOT EXISTS public.roles (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES public.servers (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug VARCHAR(32) NOT NULL,
  CONSTRAINT roles_server_name_unique UNIQUE (server_id, name),
  CONSTRAINT roles_server_slug_unique UNIQUE (server_id, slug)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id INTEGER NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES public.roles (id) ON DELETE CASCADE,
  CONSTRAINT user_roles_pk PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.channel_categories (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES public.servers (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channels (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES public.servers (id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES public.channel_categories (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  voice_user_limit INTEGER
);

CREATE TABLE IF NOT EXISTS public.channel_permissions (
  channel_id INTEGER NOT NULL REFERENCES public.channels (id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES public.roles (id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_send BOOLEAN NOT NULL DEFAULT TRUE,
  can_connect BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT channel_permissions_pk PRIMARY KEY (channel_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.channel_user_permissions (
  channel_id INTEGER NOT NULL REFERENCES public.channels (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_send BOOLEAN NOT NULL DEFAULT TRUE,
  can_connect BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT channel_user_permissions_pk PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES public.channels (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_at TIMESTAMPTZ,
  pinned_by INTEGER REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.direct_conversations (
  id SERIAL PRIMARY KEY,
  user_low_id INTEGER NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  user_high_id INTEGER NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT direct_conversations_pair_unique UNIQUE (user_low_id, user_high_id),
  CONSTRAINT direct_conversations_pair_order_check CHECK (user_low_id < user_high_id)
);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES public.direct_conversations (id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.server_invites (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES public.servers (id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.server_emojis (
  id SERIAL PRIMARY KEY,
  server_id INTEGER NOT NULL REFERENCES public.servers (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES public.messages (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  reaction_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT message_reactions_unique_user_key UNIQUE (message_id, user_id, reaction_key)
);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_message_id INTEGER REFERENCES public.messages (id) ON DELETE SET NULL,
  channel_id INTEGER REFERENCES public.channels (id) ON DELETE SET NULL,
  server_id INTEGER REFERENCES public.servers (id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_channel ON public.messages (channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_channels_server ON public.channels (server_id);
CREATE INDEX IF NOT EXISTS idx_channels_category ON public.channels (category_id);
CREATE INDEX IF NOT EXISTS idx_server_members_user ON public.server_members (user_id);
CREATE INDEX IF NOT EXISTS idx_server_members_server ON public.server_members (server_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON public.direct_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_channel_pinned_created ON public.messages (channel_id, is_pinned, created_at);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions (message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_key ON public.message_reactions (message_id, reaction_key);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON public.admin_audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_server ON public.admin_audit_logs (server_id);
CREATE INDEX IF NOT EXISTS idx_server_invites_server ON public.server_invites (server_id);
CREATE INDEX IF NOT EXISTS idx_server_invites_token ON public.server_invites (token);
CREATE INDEX IF NOT EXISTS idx_server_emojis_server ON public.server_emojis (server_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_server_emojis_server_name_unique ON public.server_emojis (server_id, name);

-- Registro para node-pg-migrate: evita re-ejecutar migraciones si luego usas npm run migrate
CREATE TABLE IF NOT EXISTS public.pgmigrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  run_on TIMESTAMP NOT NULL
);

INSERT INTO public.pgmigrations (name, run_on)
SELECT name, NOW()
FROM (
  VALUES
    ('1733000000000_init_akonet_schema'),
    ('1733000001000_add_admin_user_and_flag'),
    ('1733000002000_add_server_invites'),
    ('1733000003000_add_server_emojis'),
    ('1733000004000_add_message_pinning'),
    ('1733000005000_add_message_reactions_and_audit_logs'),
    ('1733000006000_add_user_profile_settings'),
    ('1733000007000_add_user_presence_status'),
    ('1733000008000_add_private_channels'),
    ('1733000009000_add_voice_channel_user_limit')
) AS t (name)
WHERE NOT EXISTS (SELECT 1 FROM public.pgmigrations p WHERE p.name = t.name);

COMMIT;

-- -----------------------------------------------------------------------------
-- Supabase Realtime: añadir tablas a la publicación (idempotente).
-- Solo aplica en proyectos Supabase (existe publicación supabase_realtime).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'direct_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'server_members'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.server_members;
    END IF;
  END IF;
END $$;
