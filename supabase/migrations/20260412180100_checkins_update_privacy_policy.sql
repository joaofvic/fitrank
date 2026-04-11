-- Permite ao dono do check-in atualizar seus proprios campos de privacidade
CREATE POLICY checkins_update_own_privacy
  ON public.checkins
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND tenant_id = public.current_tenant_id())
  WITH CHECK (user_id = auth.uid() AND tenant_id = public.current_tenant_id());
