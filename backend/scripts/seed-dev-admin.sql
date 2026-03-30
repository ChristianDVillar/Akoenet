-- Run against the SAME database as your AkoeNet backend (psql, Supabase SQL, etc.)
-- Login after: christiandvillar@gmail.com / AdminTest

INSERT INTO users (username, email, password, is_admin)
VALUES (
  'christiandvillar',
  'christiandvillar@gmail.com',
  '$2a$10$cf.pd6GsI0AN.AXOYCyOKeWbU8a/hshcRFmhBo5zTVA1YYn8QwidW',
  true
)
ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password,
  is_admin = true,
  deleted_at = NULL,
  erased_at = NULL,
  deletion_reason = NULL;
