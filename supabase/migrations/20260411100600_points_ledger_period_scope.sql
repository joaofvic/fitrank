-- Ajuste de pontos por período: coluna period_scope + atualização das RPCs
-- period_scope restringe em qual aba de ranking (day/week/month) os pontos aparecem.
-- NULL = aparece em todos os períodos (backward compat para entradas antigas).

-- 1. Nova coluna em points_ledger -----------------------------------------------
alter table public.points_ledger
  add column if not exists period_scope text
  check (period_scope is null or period_scope in ('day', 'week', 'month'));

-- 2. admin_adjust_points: aceita e armazena period_scope ------------------------
-- Remove overloads antigos para evitar ambiguidade na resolução de funções.
drop function if exists public.admin_adjust_points(uuid, integer, text, text, uuid);
drop function if exists public.admin_adjust_points(uuid, integer, text, text, uuid, date, text);
create or replace function public.admin_adjust_points(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_reference text,
  p_actor uuid,
  p_effective_date date default current_date,
  p_category text default 'manual',
  p_period_scope text default null
)
returns public.points_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before int;
  v_after int;
  v_tenant uuid;
  v_row public.points_ledger;
  r record;
  v_eff date;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'delta inválido';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason obrigatória';
  end if;
  if p_period_scope is not null and p_period_scope not in ('day', 'week', 'month') then
    raise exception 'period_scope inválido: use day, week ou month';
  end if;

  v_eff := coalesce(p_effective_date, current_date);

  select p.tenant_id, p.pontos
  into v_tenant, v_before
  from public.profiles p
  where p.id = p_user_id
  for update;

  v_before := coalesce(v_before, 0);
  v_after := greatest(0, v_before + p_delta);

  if exists (select 1 from public.profiles p where p.id = p_user_id) then
    begin
      perform set_config('fitrank.internal_profile_update', '1', true);
      update public.profiles
      set pontos = v_after, updated_at = now()
      where id = p_user_id;
      perform set_config('fitrank.internal_profile_update', '0', true);
    exception
      when others then
        perform set_config('fitrank.internal_profile_update', '0', true);
        raise;
    end;
  end if;

  for r in
    select dp.id
    from public.desafio_participantes dp
    inner join public.desafios des on des.id = dp.desafio_id
    where dp.user_id = p_user_id
      and des.tenant_id = v_tenant
      and v_eff >= coalesce(des.data_inicio, des.mes_referencia)
      and v_eff <= coalesce(
        des.data_fim,
        (des.mes_referencia + interval '1 month' - interval '1 day')::date
      )
  loop
    perform set_config('fitrank.internal_desafio_points', '1', true);
    update public.desafio_participantes
    set pontos_desafio = greatest(0, pontos_desafio + p_delta)
    where id = r.id;
    perform set_config('fitrank.internal_desafio_points', '0', true);
  end loop;

  insert into public.points_ledger (
    tenant_id, user_id, delta, category, reason, reference,
    effective_date, created_by, points_before, points_after, period_scope
  ) values (
    v_tenant, p_user_id, p_delta,
    coalesce(nullif(trim(coalesce(p_category, '')), ''), 'manual'),
    trim(p_reason),
    nullif(trim(coalesce(p_reference, '')), ''),
    v_eff, p_actor, v_before, v_after, p_period_scope
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- 3. get_tenant_leaderboard_period: nova assinatura com p_period ----------------
-- DROP obrigatório pois a assinatura antiga (2 params) difere da nova (3 params).
drop function if exists public.get_tenant_leaderboard_period(date, date);

create or replace function public.get_tenant_leaderboard_period(
  p_start date,
  p_end date,
  p_period text default null
)
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
  with base as (
    select
      p.id,
      coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.nome), ''), 'Atleta')::text as nome_exibicao,
      coalesce(sum(case when c.photo_review_status is distinct from 'rejected' then c.points_awarded else 0 end), 0)::integer as pontos_checkins,
      coalesce(sum(l.delta), 0)::integer as pontos_ledger,
      p.streak,
      p.is_pro,
      coalesce(nullif(trim(p.academia), ''), '') as academia
    from public.profiles p
    left join public.checkins c
      on c.user_id = p.id
     and c.tenant_id = p.tenant_id
     and c.checkin_local_date >= p_start
     and c.checkin_local_date <= p_end
    left join public.points_ledger l
      on l.user_id = p.id
     and l.tenant_id = p.tenant_id
     and l.effective_date >= p_start
     and l.effective_date <= p_end
     and (p_period is null or l.period_scope is null or l.period_scope = p_period)
    where p.tenant_id = public.current_tenant_id()
    group by p.id, p.display_name, p.nome, p.streak, p.is_pro, p.academia
  )
  select
    id,
    nome_exibicao,
    (pontos_checkins + pontos_ledger)::integer as pontos,
    streak,
    is_pro,
    academia
  from base
  order by (pontos_checkins + pontos_ledger) desc, id asc;
$$;

grant execute on function public.get_tenant_leaderboard_period(date, date, text) to authenticated;
