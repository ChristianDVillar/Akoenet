-- Repara: "Not run migration 1733000001000... is preceding already run migration 1733000002000..."
-- Preferible desde backend/: npm run migrate:fix-order
-- O ejecutar aquí en Supabase SQL:

INSERT INTO public.pgmigrations (name, run_on)
SELECT
  '1733000001000_add_admin_user_and_flag',
  COALESCE(
    (SELECT run_on + interval '1 microsecond' FROM public.pgmigrations WHERE name = '1733000000000_init_akonet_schema' LIMIT 1),
    (SELECT run_on - interval '1 microsecond' FROM public.pgmigrations WHERE name = '1733000002000_add_server_invites' LIMIT 1),
    NOW()
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.pgmigrations WHERE name = '1733000001000_add_admin_user_and_flag'
);

-- Si el INSERT no añade fila y el esquema ya está completo, reinicio ordenado (borra solo el registro de migraciones):
-- TRUNCATE public.pgmigrations;
-- INSERT INTO public.pgmigrations (name, run_on)
-- SELECT n, TIMESTAMPTZ '2000-01-01 00:00:00 UTC' + (ord * interval '1 millisecond')
-- FROM unnest(ARRAY[
--   '1733000000000_init_akonet_schema',
--   '1733000001000_add_admin_user_and_flag',
--   '1733000002000_add_server_invites',
--   '1733000003000_add_server_emojis',
--   '1733000004000_add_message_pinning',
--   '1733000005000_add_message_reactions_and_audit_logs',
--   '1733000006000_add_user_profile_settings',
--   '1733000007000_add_user_presence_status',
--   '1733000008000_add_private_channels'
-- ]) WITH ORDINALITY AS t(n, ord);
