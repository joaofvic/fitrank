-- Permite visualizar perfis de usuarios do mesmo tenant (necessario para o sistema social)
-- A policy anterior (profiles_select_own) permitia ver apenas o proprio perfil.
-- Com esta policy adicional, usuarios autenticados podem ver display_name de colegas do tenant.

CREATE POLICY profiles_select_same_tenant
  ON public.profiles FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
