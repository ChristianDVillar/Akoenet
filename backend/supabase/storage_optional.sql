-- =============================================================================
-- AkoeNet — Storage en Supabase (OPCIONAL)
-- =============================================================================
-- El backend actual sirve uploads vía Express (local o S3/MinIO). Este script
-- prepara buckets si quieres migrar avatars/emojis a Supabase Storage más adelante.
-- Ejecutar en Supabase → SQL después de akonet_schema.sql (o npm run migrate).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('akonet-media', 'akonet-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Lectura pública de objetos en este bucket (URLs públicas o transformaciones).
DROP POLICY IF EXISTS "akonet_media_public_read" ON storage.objects;
CREATE POLICY "akonet_media_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'akonet-media');

-- Subida: usuarios autenticados con Supabase Auth (JWT en cliente). El backend Node
-- con service_role / connection string postgres no pasa por estas políticas igual.
DROP POLICY IF EXISTS "akonet_media_authenticated_insert" ON storage.objects;
CREATE POLICY "akonet_media_authenticated_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'akonet-media');

DROP POLICY IF EXISTS "akonet_media_authenticated_update" ON storage.objects;
CREATE POLICY "akonet_media_authenticated_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'akonet-media')
WITH CHECK (bucket_id = 'akonet-media');

DROP POLICY IF EXISTS "akonet_media_authenticated_delete" ON storage.objects;
CREATE POLICY "akonet_media_authenticated_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'akonet-media');
