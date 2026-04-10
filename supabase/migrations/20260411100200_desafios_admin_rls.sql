-- Epic Desafios: RLS para platform_admin ter CRUD completo em desafios e desafio_participantes.
-- Policies existentes de SELECT por tenant (usuarios normais) são mantidas.

-- desafios: SELECT cross-tenant para platform_admin
create policy desafios_admin_select
  on public.desafios
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_platform_master, false)
    )
  );

-- desafios: INSERT para platform_admin
create policy desafios_admin_insert
  on public.desafios
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_platform_master, false)
    )
  );

-- desafios: UPDATE para platform_admin
create policy desafios_admin_update
  on public.desafios
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_platform_master, false)
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_platform_master, false)
    )
  );

-- desafios: DELETE para platform_admin (soft-delete via status é preferido, mas defesa em profundidade)
create policy desafios_admin_delete
  on public.desafios
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_platform_master, false)
    )
  );

-- desafio_participantes: SELECT cross-tenant para platform_admin
create policy desafio_participantes_admin_select
  on public.desafio_participantes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_platform_master, false)
    )
  );

-- desafio_participantes: DELETE para platform_admin (remover participante com auditoria)
create policy desafio_participantes_admin_delete
  on public.desafio_participantes
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_platform_master, false)
    )
  );
