-- Epic 2: RPCs de ranking (sem expor colunas sensíveis), ranking de desafio,
-- pontos de desafio ao check-in, bucket de fotos, seed desafio mensal (tenant default).

-- -----------------------------------------------------------------------------
-- Leaderboard do tenant (somente campos públicos)
-- -----------------------------------------------------------------------------
create or replace function public.get_tenant_leaderboard()
returns table (
  id uuid,
  nome_exibicao text,
  pontos integer,
  streak integer,
  is_pro boolean,
  academia text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.nome), ''), 'Atleta')::text,
    p.pontos,
    p.streak,
    p.is_pro,
    coalesce(nullif(trim(p.academia), ''), '')
  from public.profiles p
  where p.tenant_id = public.current_tenant_id()
  order by p.pontos desc, p.id asc;
$$;

grant execute on function public.get_tenant_leaderboard() to authenticated;

-- -----------------------------------------------------------------------------
-- Ranking de um desafio (mesmo tenant)
-- -----------------------------------------------------------------------------
create or replace function public.get_desafio_ranking(p_desafio_id uuid)
returns table (
  user_id uuid,
  nome_exibicao text,
  pontos_desafio integer,
  is_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    dp.user_id,
    coalesce(nullif(trim(pr.display_name), ''), nullif(trim(pr.nome), ''), 'Atleta')::text,
    dp.pontos_desafio,
    (dp.user_id = auth.uid())
  from public.desafio_participantes dp
  inner join public.desafios d on d.id = dp.desafio_id
  inner join public.profiles pr on pr.id = dp.user_id
  where dp.desafio_id = p_desafio_id
    and d.tenant_id = public.current_tenant_id()
    and pr.tenant_id = public.current_tenant_id()
  order by dp.pontos_desafio desc, dp.user_id asc;
$$;

grant execute on function public.get_desafio_ranking(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Permitir atualização interna de pontos_desafio (trigger em check-ins)
-- -----------------------------------------------------------------------------
create or replace function public.desafio_participantes_lock_points()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if current_setting('fitrank.internal_desafio_points', true) = '1' then
      return new;
    end if;
    if new.pontos_desafio is distinct from old.pontos_desafio then
      raise exception 'pontos_desafio só podem ser alterados pelo servidor';
    end if;
  end if;
  return new;
end;
$$;

-- Soma pontos do check-in nos desafios ativos do mês em que o usuário está inscrito
create or replace function public.bump_desafio_points_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select dp.id
    from public.desafio_participantes dp
    inner join public.desafios des on des.id = dp.desafio_id
    where dp.user_id = new.user_id
      and des.tenant_id = new.tenant_id
      and des.ativo = true
      and date_trunc('month', des.mes_referencia::timestamp) = date_trunc('month', new.checkin_local_date::timestamp)
  loop
    perform set_config('fitrank.internal_desafio_points', '1', true);
    update public.desafio_participantes
    set pontos_desafio = pontos_desafio + new.points_awarded
    where id = r.id;
    perform set_config('fitrank.internal_desafio_points', '0', true);
  end loop;
  return new;
end;
$$;

create trigger checkins_bump_desafio_trg
  after insert on public.checkins
  for each row
  execute function public.bump_desafio_points_on_checkin();

-- -----------------------------------------------------------------------------
-- Storage: fotos de check-in (path: {tenant_id}/{user_id}/arquivo)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('checkin-photos', 'checkin-photos', true)
on conflict (id) do nothing;

create policy checkin_photos_select_authenticated
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'checkin-photos');

create policy checkin_photos_insert_own_path
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'checkin-photos'
    and (storage.foldername(name))[1] = (select tenant_id::text from public.profiles where id = auth.uid())
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy checkin_photos_update_own_path
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'checkin-photos'
    and (storage.foldername(name))[1] = (select tenant_id::text from public.profiles where id = auth.uid())
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy checkin_photos_delete_own_path
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'checkin-photos'
    and (storage.foldername(name))[1] = (select tenant_id::text from public.profiles where id = auth.uid())
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- Seed: um desafio mensal por tenant default (idempotente)
-- -----------------------------------------------------------------------------
insert into public.desafios (tenant_id, nome, ativo, mes_referencia)
select t.id, 'Desafio do mês', true, date_trunc('month', (current_date at time zone 'utc'))::date
from public.tenants t
where t.slug = 'default'
on conflict (tenant_id, mes_referencia) do nothing;
