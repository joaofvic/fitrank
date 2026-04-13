-- =============================================================
-- Epic 5 — Boost de Pontos
-- =============================================================

-- 1. Tabela de boosts comprados
create table if not exists public.point_boosts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  points          int not null,
  payment_method  text not null default 'pro',
  created_at      timestamptz not null default now()
);

create index idx_point_boosts_user on public.point_boosts(user_id);
create index idx_point_boosts_user_week on public.point_boosts(user_id, created_at);

alter table public.point_boosts enable row level security;

create policy point_boosts_select_own on public.point_boosts
  for select to authenticated
  using (user_id = auth.uid());

-- 2. RPC: comprar boost de pontos
create or replace function public.purchase_boost(p_points int)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant uuid;
  v_is_pro boolean;
  v_pontos_before int;
  v_pontos_after int;
  v_xp int;
  v_boosts_this_week int;
  v_week_start timestamptz;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'Não autenticado');
  end if;

  -- Validar pontos entre 10 e 100
  if p_points < 10 or p_points > 100 then
    return jsonb_build_object('error', 'Quantidade deve ser entre 10 e 100 pontos');
  end if;

  select tenant_id, is_pro, pontos, xp
  into v_tenant, v_is_pro, v_pontos_before, v_xp
  from public.profiles where id = v_user_id for update;

  if v_tenant is null then
    return jsonb_build_object('error', 'Perfil não encontrado');
  end if;

  -- Somente PRO
  if not coalesce(v_is_pro, false) then
    return jsonb_build_object('error', 'Disponível apenas para membros PRO');
  end if;

  -- Limite de 2 boosts por semana (segunda a domingo)
  v_week_start := date_trunc('week', now());
  select count(*) into v_boosts_this_week
  from public.point_boosts
  where user_id = v_user_id
    and created_at >= v_week_start;

  if v_boosts_this_week >= 2 then
    return jsonb_build_object('error', 'Limite de 2 boosts por semana já atingido');
  end if;

  v_pontos_after := coalesce(v_pontos_before, 0) + p_points;

  -- Registrar boost
  insert into public.point_boosts (user_id, tenant_id, points, payment_method)
  values (v_user_id, v_tenant, p_points, 'pro');

  -- Registrar no ledger
  insert into public.points_ledger (
    user_id, tenant_id, delta, category, reason, created_by, points_before, points_after
  ) values (
    v_user_id, v_tenant, p_points, 'boost',
    'Boost de ' || p_points || ' pontos (PRO)',
    v_user_id, v_pontos_before, v_pontos_after
  );

  -- Atualizar perfil: pontos + 5 XP fixo
  begin
    perform set_config('fitrank.internal_profile_update', '1', true);
    update public.profiles
    set
      pontos = v_pontos_after,
      xp = coalesce(v_xp, 0) + 5,
      updated_at = now()
    where id = v_user_id;
    perform set_config('fitrank.internal_profile_update', '0', true);
  exception
    when others then
      perform set_config('fitrank.internal_profile_update', '0', true);
      raise;
  end;

  -- Recalcular liga após XP
  perform public.recalculate_league(v_user_id);

  -- Notificação
  insert into public.notifications (user_id, tenant_id, type, title, body, data)
  values (
    v_user_id, v_tenant,
    'boost_purchased',
    'Boost ativado!',
    '+' || p_points || ' pontos adicionados ao seu perfil.',
    jsonb_build_object('points', p_points, 'total', v_pontos_after)
  );

  return jsonb_build_object(
    'success', true,
    'points_added', p_points,
    'points_total', v_pontos_after,
    'boosts_remaining', 2 - (v_boosts_this_week + 1)
  );
end;
$$;

grant execute on function public.purchase_boost(int) to authenticated;

-- 3. RPC auxiliar: verificar status de boost do usuário
create or replace function public.get_boost_status()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_pro boolean;
  v_boosts_this_week int;
  v_week_start timestamptz;
begin
  if v_user_id is null then
    return jsonb_build_object('available', false);
  end if;

  select is_pro into v_is_pro
  from public.profiles where id = v_user_id;

  v_week_start := date_trunc('week', now());
  select count(*) into v_boosts_this_week
  from public.point_boosts
  where user_id = v_user_id
    and created_at >= v_week_start;

  return jsonb_build_object(
    'is_pro', coalesce(v_is_pro, false),
    'boosts_used', v_boosts_this_week,
    'boosts_remaining', greatest(0, 2 - v_boosts_this_week),
    'max_per_week', 2,
    'min_points', 10,
    'max_points', 100
  );
end;
$$;

grant execute on function public.get_boost_status() to authenticated;
