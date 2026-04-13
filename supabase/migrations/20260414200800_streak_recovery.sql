-- =============================================================
-- Epic 4 — Streak Recovery Pago
-- =============================================================

-- 1. Tabela de registros de streak recovery
create table if not exists public.streak_recoveries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  recovered_date  date not null,
  streak_before   int not null,
  streak_after    int not null,
  payment_method  text not null default 'pro',
  created_at      timestamptz not null default now()
);

create index idx_streak_recoveries_user on public.streak_recoveries(user_id);

alter table public.streak_recoveries enable row level security;

create policy streak_recoveries_select_own on public.streak_recoveries
  for select to authenticated
  using (user_id = auth.uid());

-- 2. RPC: recuperar streak quebrado
create or replace function public.recover_streak(p_date date default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant uuid;
  v_is_pro boolean;
  v_last_checkin date;
  v_streak_before int;
  v_streak_after int;
  v_yesterday date;
  v_gap_date date;
  v_recoveries_this_month int;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'Não autenticado');
  end if;

  select tenant_id, is_pro, last_checkin_date, streak
  into v_tenant, v_is_pro, v_last_checkin, v_streak_before
  from public.profiles where id = v_user_id;

  if v_tenant is null then
    return jsonb_build_object('error', 'Perfil não encontrado');
  end if;

  -- Somente membros PRO podem recuperar streak
  if not coalesce(v_is_pro, false) then
    return jsonb_build_object('error', 'Disponível apenas para membros PRO');
  end if;

  v_yesterday := current_date - 1;

  -- Determinar a data do gap (dia perdido)
  if p_date is not null then
    v_gap_date := p_date;
  else
    -- Assume o dia anterior ao último check-in + 1 (o dia que quebrou)
    -- Se last_checkin_date é anterior a ontem, o gap é last_checkin_date + 1
    if v_last_checkin is null then
      return jsonb_build_object('error', 'Nenhum check-in anterior encontrado');
    end if;
    v_gap_date := v_last_checkin + 1;
  end if;

  -- Validação: gap deve ser no passado (não hoje, não futuro)
  if v_gap_date >= current_date then
    return jsonb_build_object('error', 'A data de recuperação deve ser anterior a hoje');
  end if;

  -- Validação: gap não pode ser muito antigo (max 3 dias)
  if v_gap_date < current_date - 3 then
    return jsonb_build_object('error', 'Só é possível recuperar streaks dos últimos 3 dias');
  end if;

  -- Validação: limite de 1 recovery por mês
  select count(*) into v_recoveries_this_month
  from public.streak_recoveries
  where user_id = v_user_id
    and date_trunc('month', created_at) = date_trunc('month', now());

  if v_recoveries_this_month >= 1 then
    return jsonb_build_object('error', 'Limite de 1 recuperação por mês já atingido');
  end if;

  -- Verificar que já não existe check-in nesse dia
  if exists (
    select 1 from public.checkins
    where user_id = v_user_id
      and tenant_id = v_tenant
      and checkin_local_date = v_gap_date
      and photo_review_status is distinct from 'rejected'
  ) then
    return jsonb_build_object('error', 'Já existe check-in para essa data');
  end if;

  -- Inserir check-in fantasma para o dia do gap
  insert into public.checkins (
    user_id, tenant_id, checkin_local_date, tipo_treino,
    points_awarded, foto_url, photo_review_status, feed_visible
  ) values (
    v_user_id, v_tenant, v_gap_date, 'Streak Recovery',
    0, 'streak://recovery', 'approved', false
  );

  -- Recomputar streak (o check-in fantasma agora preenche o gap)
  perform public.recompute_profile_streak(v_user_id);

  -- Buscar streak atualizado
  select streak into v_streak_after
  from public.profiles where id = v_user_id;

  -- Registrar recovery
  insert into public.streak_recoveries (
    user_id, tenant_id, recovered_date, streak_before, streak_after, payment_method
  ) values (
    v_user_id, v_tenant, v_gap_date, v_streak_before, v_streak_after, 'pro'
  );

  -- Notificação
  insert into public.notifications (user_id, tenant_id, type, title, body, data)
  values (
    v_user_id, v_tenant,
    'streak_recovered',
    'Streak recuperado!',
    'Seu streak foi restaurado para ' || v_streak_after || ' dias.',
    jsonb_build_object(
      'streak_before', v_streak_before,
      'streak_after', v_streak_after,
      'recovered_date', v_gap_date
    )
  );

  return jsonb_build_object(
    'success', true,
    'streak_before', v_streak_before,
    'streak_after', v_streak_after,
    'recovered_date', v_gap_date
  );
end;
$$;

grant execute on function public.recover_streak(date) to authenticated;

-- 3. RPC auxiliar: verificar se o usuário pode recuperar streak
create or replace function public.can_recover_streak()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_pro boolean;
  v_last_checkin date;
  v_streak int;
  v_yesterday date;
  v_gap_date date;
  v_recoveries_this_month int;
begin
  if v_user_id is null then
    return jsonb_build_object('can_recover', false);
  end if;

  select is_pro, last_checkin_date, streak
  into v_is_pro, v_last_checkin, v_streak
  from public.profiles where id = v_user_id;

  v_yesterday := current_date - 1;

  -- Sem check-in anterior
  if v_last_checkin is null then
    return jsonb_build_object('can_recover', false, 'reason', 'no_checkins');
  end if;

  -- Streak não está quebrado (last_checkin é hoje ou ontem)
  if v_last_checkin >= v_yesterday then
    return jsonb_build_object('can_recover', false, 'reason', 'streak_active');
  end if;

  -- Gap muito antigo
  v_gap_date := v_last_checkin + 1;
  if v_gap_date < current_date - 3 then
    return jsonb_build_object('can_recover', false, 'reason', 'too_old');
  end if;

  -- Não é PRO
  if not coalesce(v_is_pro, false) then
    return jsonb_build_object(
      'can_recover', false,
      'reason', 'not_pro',
      'gap_date', v_gap_date,
      'streak_before', v_streak
    );
  end if;

  -- Limite mensal
  select count(*) into v_recoveries_this_month
  from public.streak_recoveries
  where user_id = v_user_id
    and date_trunc('month', created_at) = date_trunc('month', now());

  if v_recoveries_this_month >= 1 then
    return jsonb_build_object(
      'can_recover', false,
      'reason', 'monthly_limit',
      'gap_date', v_gap_date,
      'streak_before', v_streak
    );
  end if;

  return jsonb_build_object(
    'can_recover', true,
    'gap_date', v_gap_date,
    'streak_before', v_streak,
    'recoveries_this_month', v_recoveries_this_month
  );
end;
$$;

grant execute on function public.can_recover_streak() to authenticated;
