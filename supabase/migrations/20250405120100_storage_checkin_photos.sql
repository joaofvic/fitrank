-- Bucket privado para fotos de check-in: {tenant_id}/{user_id}/arquivo

INSERT INTO storage.buckets (id, name, public)
VALUES ('checkin-photos', 'checkin-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY checkin_photos_insert_own
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'checkin-photos'
    AND (storage.foldername(name))[1] = (SELECT p.tenant_id::text FROM public.profiles p WHERE p.id = auth.uid())
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY checkin_photos_select_own
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'checkin-photos'
    AND (storage.foldername(name))[1] = (SELECT p.tenant_id::text FROM public.profiles p WHERE p.id = auth.uid())
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY checkin_photos_update_own
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'checkin-photos'
    AND (storage.foldername(name))[1] = (SELECT p.tenant_id::text FROM public.profiles p WHERE p.id = auth.uid())
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'checkin-photos'
    AND (storage.foldername(name))[1] = (SELECT p.tenant_id::text FROM public.profiles p WHERE p.id = auth.uid())
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY checkin_photos_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'checkin-photos'
    AND (storage.foldername(name))[1] = (SELECT p.tenant_id::text FROM public.profiles p WHERE p.id = auth.uid())
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
