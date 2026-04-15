-- Migração: Cakto → Mercado Pago
-- Renomeia colunas, remove colunas desnecessárias, atualiza RPCs e triggers.

-- ============================================================
-- 1) profiles: renomear colunas Cakto → MP
-- ============================================================

alter table public.profiles
  rename column cakto_customer_email to mp_payer_email;

alter table public.profiles
  rename column cakto_order_id to mp_payment_id;

-- ============================================================
-- 2) subscription_plans: remover colunas Cakto (MP usa preferências sob demanda)
-- ============================================================

alter table public.subscription_plans
  drop column if exists cakto_product_id,
  drop column if exists cakto_offer_id,
  drop column if exists cakto_checkout_url;

comment on table public.subscription_plans is
  'Catálogo de planos de assinatura. Checkout via Mercado Pago Preferences (sob demanda).';

-- ============================================================
-- 3) subscriptions: renomear colunas Cakto → MP
-- ============================================================

drop index if exists subscriptions_cakto_customer_idx;

alter table public.subscriptions
  rename column cakto_order_id to mp_payment_id;

alter table public.subscriptions
  rename column cakto_customer_email to mp_payer_email;

create index if not exists subscriptions_mp_payer_idx
  on public.subscriptions (mp_payer_email);

comment on table public.subscriptions is
  'Espelho local das assinaturas por usuário/tenant (Mercado Pago).';

-- ============================================================
-- 4) desafios: remover colunas Cakto (preferências MP criadas sob demanda)
-- ============================================================

alter table public.desafios
  drop column if exists cakto_offer_id,
  drop column if exists cakto_checkout_url;

-- ============================================================
-- 5) Trigger: atualizar profiles_prevent_privilege_escalation
-- ============================================================

create or replace function public.profiles_prevent_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if current_setting('fitrank.internal_profile_update', true) = '1' then
      new.updated_at := now();
      return new;
    end if;

    if new.is_platform_master is distinct from old.is_platform_master then
      raise exception 'Troca de is_platform_master não permitida via API';
    end if;
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'Troca de tenant_id não permitida via API';
    end if;
    if new.id is distinct from old.id then
      raise exception 'Troca de id não permitida';
    end if;
    if new.pontos is distinct from old.pontos then
      raise exception 'Atualização de pontos apenas via regras do servidor';
    end if;
    if new.streak is distinct from old.streak then
      raise exception 'Atualização de streak apenas via regras do servidor';
    end if;
    if new.is_pro is distinct from old.is_pro then
      raise exception 'Atualização de is_pro apenas via regras do servidor';
    end if;
    if new.last_checkin_date is distinct from old.last_checkin_date then
      raise exception 'Atualização de last_checkin_date apenas via regras do servidor';
    end if;
    if new.mp_payer_email is distinct from old.mp_payer_email then
      raise exception 'Atualização de mp_payer_email apenas via regras do servidor';
    end if;
    if new.mp_payment_id is distinct from old.mp_payment_id then
      raise exception 'Atualização de mp_payment_id apenas via regras do servidor';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================
-- 6) RPC: internal_update_profile_mp (substitui _cakto)
-- ============================================================

drop function if exists public.internal_update_profile_cakto(uuid, boolean, text, text);

create or replace function public.internal_update_profile_mp(
  p_user_id uuid,
  p_is_pro boolean,
  p_mp_payer_email text default null,
  p_mp_payment_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('fitrank.internal_profile_update', '1', true);

  update public.profiles
  set
    is_pro = p_is_pro,
    mp_payer_email = coalesce(p_mp_payer_email, mp_payer_email),
    mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id)
  where id = p_user_id;

  perform set_config('fitrank.internal_profile_update', '0', true);
exception when others then
  perform set_config('fitrank.internal_profile_update', '0', true);
  raise;
end;
$$;

comment on function public.internal_update_profile_mp(uuid, boolean, text, text) is
  'Atualiza campos MP protegidos em profiles (uso exclusivo de Edge Functions via service_role).';

revoke execute on function public.internal_update_profile_mp(uuid, boolean, text, text) from public;
revoke execute on function public.internal_update_profile_mp(uuid, boolean, text, text) from authenticated;

-- ============================================================
-- 7) RPC: admin_list_subscriptions — atualizar retorno
-- ============================================================

drop function if exists public.admin_list_subscriptions(text, uuid, integer, integer);

create or replace function public.admin_list_subscriptions(
  p_status text default null,
  p_tenant_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  tenant_id uuid,
  plan_id uuid,
  mp_payment_id text,
  mp_payer_email text,
  status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  canceled_at timestamptz,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  user_display_name text,
  user_email text,
  tenant_name text,
  plan_name text,
  plan_price_amount integer
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.user_id,
    s.tenant_id,
    s.plan_id,
    s.mp_payment_id,
    s.mp_payer_email,
    s.status,
    s.current_period_start,
    s.current_period_end,
    s.cancel_at_period_end,
    s.canceled_at,
    s.metadata,
    s.created_at,
    s.updated_at,
    p.display_name as user_display_name,
    u.email as user_email,
    t.name as tenant_name,
    sp.name as plan_name,
    sp.price_amount as plan_price_amount
  from public.subscriptions s
  join public.profiles p on p.id = s.user_id
  join auth.users u on u.id = s.user_id
  join public.tenants t on t.id = s.tenant_id
  left join public.subscription_plans sp on sp.id = s.plan_id
  where (p_status is null or s.status = p_status)
    and (p_tenant_id is null or s.tenant_id = p_tenant_id)
  order by s.created_at desc
  limit p_limit
  offset p_offset;
$$;

comment on function public.admin_list_subscriptions(text, uuid, integer, integer) is
  'Lista assinaturas com dados de usuário/tenant/plano para admin (Mercado Pago).';

grant execute on function public.admin_list_subscriptions(text, uuid, integer, integer) to authenticated;

-- ============================================================
-- 8) Engagement segment match: usar mp_payment_id
-- ============================================================

drop function if exists public.admin_engagement_segment_match(text, boolean, text, text, text, text);

create or replace function public.admin_engagement_segment_match(
  p_tenant_region text,
  p_pr_is_pro boolean,
  p_pr_mp_payment text,
  p_filter_region text,
  p_user_type text,
  p_plan text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    (
      p_filter_region is null
      or trim(p_filter_region) = ''
      or (
        p_tenant_region is not null
        and lower(trim(p_tenant_region)) = lower(trim(p_filter_region))
      )
    )
    and (
      p_user_type is null
      or trim(lower(p_user_type)) in ('', 'all')
      or (lower(p_user_type) = 'pro' and p_pr_is_pro)
      or (lower(p_user_type) = 'free' and not p_pr_is_pro)
    )
    and (
      p_plan is null
      or trim(lower(p_plan)) in ('', 'all')
      or (
        lower(p_plan) = 'free'
        and not p_pr_is_pro
        and coalesce(nullif(trim(p_pr_mp_payment), ''), '') = ''
      )
      or (
        lower(p_plan) = 'paid'
        and (
          p_pr_is_pro
          or coalesce(nullif(trim(p_pr_mp_payment), ''), '') <> ''
        )
      )
    );
$$;

revoke all on function public.admin_engagement_segment_match(text, boolean, text, text, text, text) from public;

-- ============================================================
-- 9) Recriar RPCs de engajamento referenciando mp_payment_id
-- ============================================================

drop function if exists public.admin_engagement_metrics(date, date, uuid, text, text, text);
drop function if exists public.admin_rejection_examples(date, date, uuid, text, int, text, text, text);
drop function if exists public.admin_engagement_alerts(uuid, text, text, text);

create or replace function public.admin_engagement_metrics(
  p_start date,
  p_end date,
  p_tenant_id uuid default null,
  p_region text default null,
  p_user_type text default null,
  p_plan text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int;
  v_total_checkins bigint;
  v_with_photo bigint;
  v_dau_avg numeric;
  v_new_profiles bigint;
  v_mod_total bigint;
  v_mod_rejected bigint;
  v_avg_mod_hours numeric;
  v_series jsonb;
  v_top_reasons jsonb;
  v_checkins_per_day numeric;
  v_photo_rate numeric;
  v_rejection_rate numeric;
  v_rej_total bigint;
  v_rejection_ranking jsonb;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_start is null or p_end is null or p_start > p_end then
    raise exception 'Intervalo de datas inválido' using errcode = '22023';
  end if;

  v_days := (p_end - p_start) + 1;
  if v_days > 366 then
    raise exception 'Período máximo: 366 dias' using errcode = '22023';
  end if;

  select count(*) into v_total_checkins
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.checkin_local_date between p_start and p_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(
      tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan
    );

  select count(*) into v_with_photo
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.checkin_local_date between p_start and p_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(
      tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan
    )
    and c.foto_url is not null
    and length(trim(c.foto_url)) > 0;

  select coalesce(avg(daily.u), 0) into v_dau_avg
  from (
    select (
      select count(distinct c.user_id)
      from public.checkins c
      inner join public.profiles pr on pr.id = c.user_id
      inner join public.tenants tn on tn.id = c.tenant_id
      where c.checkin_local_date = gs::date
        and (p_tenant_id is null or c.tenant_id = p_tenant_id)
        and public.admin_engagement_segment_match(
          tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan
        )
    ) as u
    from generate_series(p_start, p_end, interval '1 day') as gs
  ) daily;

  select count(*) into v_new_profiles
  from public.profiles p
  inner join public.tenants tn on tn.id = p.tenant_id
  where (p.created_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
    and (p_tenant_id is null or p.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(
      tn.region, p.is_pro, p.mp_payment_id, p_region, p_user_type, p_plan
    );

  select
    count(*),
    count(*) filter (where c.photo_review_status = 'rejected'),
    avg(extract(epoch from (c.photo_reviewed_at - c.created_at)) / 3600.0)
  into v_mod_total, v_mod_rejected, v_avg_mod_hours
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.foto_url is not null
    and length(trim(c.foto_url)) > 0
    and c.photo_reviewed_at is not null
    and (c.photo_reviewed_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(
      tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan
    );

  v_checkins_per_day := case when v_days > 0 then round(v_total_checkins::numeric / v_days::numeric, 4) else 0 end;
  v_photo_rate := case when coalesce(v_total_checkins, 0) > 0 then round(v_with_photo::numeric / v_total_checkins::numeric, 6) else null end;
  v_rejection_rate := case when coalesce(v_mod_total, 0) > 0 then round(v_mod_rejected::numeric / v_mod_total::numeric, 6) else null end;

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('day', s.day, 'checkins', coalesce(cc.n, 0), 'dau', coalesce(cc.dau, 0), 'new_profiles', coalesce(np.n, 0))
        order by s.day
      )
      from (select generate_series(p_start, p_end, interval '1 day')::date as day) s
      left join (
        select c.checkin_local_date as day, count(*)::int as n, count(distinct c.user_id)::int as dau
        from public.checkins c
        inner join public.profiles pr on pr.id = c.user_id
        inner join public.tenants tn on tn.id = c.tenant_id
        where c.checkin_local_date between p_start and p_end
          and (p_tenant_id is null or c.tenant_id = p_tenant_id)
          and public.admin_engagement_segment_match(tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan)
        group by 1
      ) cc on cc.day = s.day
      left join (
        select (p.created_at at time zone 'America/Sao_Paulo')::date as day, count(*)::int as n
        from public.profiles p
        inner join public.tenants tn on tn.id = p.tenant_id
        where (p.created_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
          and (p_tenant_id is null or p.tenant_id = p_tenant_id)
          and public.admin_engagement_segment_match(tn.region, p.is_pro, p.mp_payment_id, p_region, p_user_type, p_plan)
        group by 1
      ) np on np.day = s.day
    ),
    '[]'::jsonb
  ) into v_series;

  select coalesce(
    (
      select jsonb_agg(jsonb_build_object('code', q.code, 'count', q.cnt) order by q.cnt desc)
      from (
        select coalesce(nullif(trim(c.photo_rejection_reason_code), ''), '(sem código)') as code, count(*)::int as cnt
        from public.checkins c
        inner join public.profiles pr on pr.id = c.user_id
        inner join public.tenants tn on tn.id = c.tenant_id
        where c.photo_review_status = 'rejected'
          and c.photo_reviewed_at is not null
          and (c.photo_reviewed_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
          and (p_tenant_id is null or c.tenant_id = p_tenant_id)
          and public.admin_engagement_segment_match(tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan)
        group by 1 order by cnt desc limit 10
      ) q
    ),
    '[]'::jsonb
  ) into v_top_reasons;

  select count(*) into v_rej_total
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.photo_review_status = 'rejected'
    and c.photo_reviewed_at is not null
    and (c.photo_reviewed_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan);

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('rank', z.rk, 'code', z.code, 'count', z.cnt, 'pct',
          case when v_rej_total > 0 then round(z.cnt::numeric / v_rej_total::numeric, 6) else null end)
        order by z.rk
      )
      from (
        select g.code, g.cnt, row_number() over (order by g.cnt desc) as rk
        from (
          select coalesce(nullif(trim(c.photo_rejection_reason_code), ''), '(sem código)') as code, count(*)::int as cnt
          from public.checkins c
          inner join public.profiles pr on pr.id = c.user_id
          inner join public.tenants tn on tn.id = c.tenant_id
          where c.photo_review_status = 'rejected'
            and c.photo_reviewed_at is not null
            and (c.photo_reviewed_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
            and (p_tenant_id is null or c.tenant_id = p_tenant_id)
            and public.admin_engagement_segment_match(tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan)
          group by 1
        ) g
      ) z
    ),
    '[]'::jsonb
  ) into v_rejection_ranking;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'start', p_start, 'end', p_end, 'days', v_days,
      'tenant_id', p_tenant_id, 'region', p_region,
      'user_type', p_user_type, 'plan', p_plan, 'timezone', 'America/Sao_Paulo'
    ),
    'summary', jsonb_build_object(
      'total_checkins', v_total_checkins,
      'checkins_per_day', v_checkins_per_day,
      'dau_avg', coalesce(round(v_dau_avg::numeric, 4), 0),
      'new_profiles', v_new_profiles,
      'checkins_with_photo', v_with_photo,
      'photo_rate', v_photo_rate,
      'moderated_photo_count', coalesce(v_mod_total, 0),
      'avg_moderation_hours', case when v_mod_total > 0 then round(v_avg_mod_hours::numeric, 4) else null end,
      'rejected_moderation_count', coalesce(v_mod_rejected, 0),
      'rejection_rate', v_rejection_rate
    ),
    'top_rejection_reasons', v_top_reasons,
    'rejection_breakdown', jsonb_build_object(
      'total_rejected', coalesce(v_rej_total, 0),
      'reasons', coalesce(v_rejection_ranking, '[]'::jsonb)
    ),
    'series', jsonb_build_object('by_day', v_series)
  );
end;
$$;

comment on function public.admin_engagement_metrics(date, date, uuid, text, text, text) is
  'KPIs de engajamento e moderação por período/tenant/segmento; apenas is_platform_master.';

grant execute on function public.admin_engagement_metrics(date, date, uuid, text, text, text) to authenticated;

create or replace function public.admin_rejection_examples(
  p_start date,
  p_end date,
  p_tenant_id uuid,
  p_reason_code text,
  p_limit int default 12,
  p_region text default null,
  p_user_type text default null,
  p_plan text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lim int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_start is null or p_end is null or p_start > p_end then
    raise exception 'Intervalo de datas inválido' using errcode = '22023';
  end if;

  v_lim := least(greatest(coalesce(p_limit, 12), 1), 30);

  return coalesce(
    (
      select jsonb_agg(to_jsonb(x) order by x.photo_reviewed_at desc nulls last)
      from (
        select
          c.id, c.user_id, c.tenant_id,
          tn.slug as tenant_slug, tn.name as tenant_name,
          c.checkin_local_date, c.tipo_treino, c.foto_url,
          c.photo_rejection_note, c.photo_reviewed_at,
          c.photo_rejection_reason_code, c.created_at
        from public.checkins c
        inner join public.profiles pr on pr.id = c.user_id
        inner join public.tenants tn on tn.id = c.tenant_id
        where c.photo_review_status = 'rejected'
          and c.photo_reviewed_at is not null
          and (c.photo_reviewed_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
          and (p_tenant_id is null or c.tenant_id = p_tenant_id)
          and public.admin_engagement_segment_match(
            tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan
          )
          and coalesce(nullif(trim(c.photo_rejection_reason_code), ''), '(sem código)') = p_reason_code
        order by c.photo_reviewed_at desc
        limit v_lim
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

comment on function public.admin_rejection_examples(date, date, uuid, text, int, text, text, text) is
  'Lista exemplos de check-ins rejeitados; apenas is_platform_master.';

grant execute on function public.admin_rejection_examples(date, date, uuid, text, int, text, text, text) to authenticated;

create or replace function public.admin_engagement_alerts(
  p_tenant_id uuid default null,
  p_region text default null,
  p_user_type text default null,
  p_plan text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_tz constant text := 'America/Sao_Paulo';
  t_end timestamptz;
  t_curr_start timestamptz;
  t_prev_start timestamptz;
  t_prev_end timestamptz;
  n_curr int; n_prev int;
  dec_curr int; dec_prev int;
  rej_curr int; rej_prev int;
  rate_curr numeric; rate_prev numeric;
  rel_inc numeric;
  h_curr numeric; h_prev numeric;
  wf_curr int; wf_prev int;
  tot_curr int; tot_prev int;
  pr_curr numeric; pr_prev numeric;
  drop_pct int; msg text; sev text;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  t_end := now();
  t_curr_start := (timezone(v_tz, t_end) - interval '24 hours') AT TIME ZONE v_tz;
  t_prev_start := (timezone(v_tz, t_end) - interval '48 hours') AT TIME ZONE v_tz;
  t_prev_end := t_curr_start;

  -- Check-ins drop
  select count(*)::int into n_curr
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.created_at >= t_curr_start and c.created_at < t_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan);

  select count(*)::int into n_prev
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.created_at >= t_prev_start and c.created_at < t_prev_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan);

  if n_prev >= 5 and n_curr::numeric < n_prev * 0.7 then
    drop_pct := greatest(1, least(100, round((n_prev - n_curr)::numeric / n_prev * 100.0)::int));
    sev := case when n_curr::numeric < n_prev * 0.5 then 'critical' else 'warning' end;
    msg := format('Check-ins caíram ~%s%% nas últimas 24h (vs 24h anteriores: %s → %s).', drop_pct, n_prev, n_curr);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', 'checkins_drop', 'severity', sev, 'message', msg,
      'meta', jsonb_build_object('prev_24h', n_prev, 'last_24h', n_curr, 'drop_pct', drop_pct, 'timezone', v_tz)
    ));
  end if;

  -- Rejection spike
  select count(*) filter (where c.photo_review_status = 'rejected')::int, count(*)::int
  into rej_curr, dec_curr
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.foto_url is not null and length(trim(c.foto_url)) > 0
    and c.photo_reviewed_at is not null
    and c.photo_reviewed_at >= t_curr_start and c.photo_reviewed_at < t_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan);

  select count(*) filter (where c.photo_review_status = 'rejected')::int, count(*)::int
  into rej_prev, dec_prev
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.foto_url is not null and length(trim(c.foto_url)) > 0
    and c.photo_reviewed_at is not null
    and c.photo_reviewed_at >= t_prev_start and c.photo_reviewed_at < t_prev_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan);

  rate_curr := case when dec_curr > 0 then rej_curr::numeric / dec_curr::numeric else 0 end;
  rate_prev := case when dec_prev > 0 then rej_prev::numeric / dec_prev::numeric else 0 end;

  if dec_curr >= 5 and dec_prev >= 5 and rate_prev >= 0.03 then
    rel_inc := (rate_curr - rate_prev) / rate_prev;
    if rel_inc >= 0.35 then
      msg := format('Rejeição subiu ~%s%% nas últimas 24h (taxa %.1f%% → %.1f%%; %s/%s vs %s/%s decisões).',
        round(rel_inc * 100.0)::int, round(rate_prev * 1000.0) / 10.0, round(rate_curr * 1000.0) / 10.0, rej_curr, dec_curr, rej_prev, dec_prev);
      sev := case when rel_inc >= 0.6 then 'critical' else 'warning' end;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'id', 'rejection_spike', 'severity', sev, 'message', msg,
        'meta', jsonb_build_object('rate_prev', rate_prev, 'rate_curr', rate_curr, 'relative_increase', rel_inc, 'timezone', v_tz)
      ));
    end if;
  elsif dec_curr >= 8 and dec_prev >= 3 and rate_prev < 0.02 and rate_curr >= 0.2 then
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', 'rejection_spike', 'severity', 'warning',
      'message', format('Taxa de rejeição elevada nas últimas 24h (~%.1f%% em %s decisões).', round(rate_curr * 1000.0) / 10.0, dec_curr),
      'meta', jsonb_build_object('rate_curr', rate_curr, 'decisions', dec_curr, 'timezone', v_tz)
    ));
  end if;

  -- Moderation slow
  select avg(extract(epoch from (c.photo_reviewed_at - c.created_at)) / 3600.0) into h_curr
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.foto_url is not null and length(trim(c.foto_url)) > 0
    and c.photo_reviewed_at is not null
    and c.photo_reviewed_at >= t_curr_start and c.photo_reviewed_at < t_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan);

  select avg(extract(epoch from (c.photo_reviewed_at - c.created_at)) / 3600.0) into h_prev
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.foto_url is not null and length(trim(c.foto_url)) > 0
    and c.photo_reviewed_at is not null
    and c.photo_reviewed_at >= t_prev_start and c.photo_reviewed_at < t_prev_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan);

  if dec_curr >= 3 and h_curr is not null then
    if h_curr >= 8.0 or (h_curr >= 6.0 and h_prev is not null and h_prev > 0 and h_curr >= h_prev * 1.35) then
      msg := format('Tempo médio até moderação alto nas últimas 24h (~%s h; antes ~%s h).',
        round(h_curr * 10.0) / 10.0,
        case when h_prev is null then '—' else (round(h_prev * 10.0) / 10.0)::text end);
      sev := case when h_curr >= 12.0 then 'critical' else 'warning' end;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'id', 'moderation_slow', 'severity', sev, 'message', msg,
        'meta', jsonb_build_object('avg_hours_curr', h_curr, 'avg_hours_prev', h_prev, 'timezone', v_tz)
      ));
    end if;
  end if;

  -- Photo rate low
  select count(*) filter (where c.foto_url is not null and length(trim(c.foto_url)) > 0)::int, count(*)::int
  into wf_curr, tot_curr
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.created_at >= t_curr_start and c.created_at < t_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan);

  select count(*) filter (where c.foto_url is not null and length(trim(c.foto_url)) > 0)::int, count(*)::int
  into wf_prev, tot_prev
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.created_at >= t_prev_start and c.created_at < t_prev_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(tn.region, pr.is_pro, pr.mp_payment_id, p_region, p_user_type, p_plan);

  pr_curr := case when tot_curr > 0 then wf_curr::numeric / tot_curr::numeric else 0 end;
  pr_prev := case when tot_prev > 0 then wf_prev::numeric / tot_prev::numeric else 0 end;

  if tot_curr >= 10 and pr_curr < 0.5 then
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', 'photo_rate_low', 'severity', 'warning',
      'message', format('Taxa de check-ins com foto baixa nas últimas 24h (~%.0f%%; %s/%s).', round(pr_curr * 100.0), wf_curr, tot_curr),
      'meta', jsonb_build_object('photo_rate', pr_curr, 'with_photo', wf_curr, 'total', tot_curr, 'timezone', v_tz)
    ));
  elsif tot_curr >= 10 and tot_prev >= 10 and pr_prev - pr_curr >= 0.12 then
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', 'photo_rate_low', 'severity', 'warning',
      'message', format('Taxa de foto caiu ~%s p.p. nas últimas 24h (%.0f%% → %.0f%%).', round((pr_prev - pr_curr) * 100.0)::int, round(pr_prev * 100.0), round(pr_curr * 100.0)),
      'meta', jsonb_build_object('photo_rate_prev', pr_prev, 'photo_rate_curr', pr_curr, 'timezone', v_tz)
    ));
  end if;

  return v_out;
end;
$$;

comment on function public.admin_engagement_alerts(uuid, text, text, text) is
  'Alertas operacionais (24h vs 24h anteriores); apenas is_platform_master.';

grant execute on function public.admin_engagement_alerts(uuid, text, text, text) to authenticated;

-- ============================================================
-- 10) RPCs desafios: remover colunas Cakto do retorno
-- ============================================================

drop function if exists public.admin_desafios_list(uuid, text, date, date, text, int, int);
drop function if exists public.admin_desafio_detail(uuid);

create or replace function public.admin_desafios_list(
  p_tenant_id uuid default null,
  p_status text default null,
  p_from date default null,
  p_to date default null,
  p_search text default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  id uuid, tenant_id uuid, tenant_slug text, nome text, descricao text, status text,
  tipo_treino text[], data_inicio date, data_fim date, mes_referencia date,
  criado_por uuid, criado_por_nome text, max_participantes integer,
  reward_winners_count integer, reward_distribution_type text, entry_fee integer,
  participantes_count bigint, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 30), 100));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select
    d.id, d.tenant_id, tn.slug as tenant_slug, d.nome, d.descricao, d.status,
    d.tipo_treino, d.data_inicio, d.data_fim, d.mes_referencia,
    d.criado_por,
    coalesce(nullif(trim(cp.display_name), ''), nullif(trim(cp.nome), ''), null) as criado_por_nome,
    d.max_participantes, d.reward_winners_count, d.reward_distribution_type, d.entry_fee,
    (select count(*) from public.desafio_participantes dp where dp.desafio_id = d.id) as participantes_count,
    d.created_at, d.updated_at
  from public.desafios d
  left join public.tenants tn on tn.id = d.tenant_id
  left join public.profiles cp on cp.id = d.criado_por
  where (p_tenant_id is null or d.tenant_id = p_tenant_id)
    and (p_status is null or d.status = p_status)
    and (p_from is null or coalesce(d.data_fim, d.mes_referencia) >= p_from)
    and (p_to is null or coalesce(d.data_inicio, d.mes_referencia) <= p_to)
    and (p_search is null or d.nome ilike '%' || p_search || '%' or d.descricao ilike '%' || p_search || '%')
  order by d.created_at desc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_desafio_detail(p_desafio_id uuid)
returns table (
  id uuid, tenant_id uuid, tenant_slug text, nome text, descricao text, status text,
  ativo boolean, tipo_treino text[], data_inicio date, data_fim date, mes_referencia date,
  criado_por uuid, criado_por_nome text, max_participantes integer,
  reward_winners_count integer, reward_distribution_type text, entry_fee integer,
  participantes_count bigint, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select
    d.id, d.tenant_id, tn.slug as tenant_slug, d.nome, d.descricao, d.status,
    d.ativo, d.tipo_treino, d.data_inicio, d.data_fim, d.mes_referencia,
    d.criado_por,
    coalesce(nullif(trim(cp.display_name), ''), nullif(trim(cp.nome), ''), null) as criado_por_nome,
    d.max_participantes, d.reward_winners_count, d.reward_distribution_type, d.entry_fee,
    (select count(*) from public.desafio_participantes dp where dp.desafio_id = d.id) as participantes_count,
    d.created_at, d.updated_at
  from public.desafios d
  left join public.tenants tn on tn.id = d.tenant_id
  left join public.profiles cp on cp.id = d.criado_por
  where d.id = p_desafio_id;
end;
$$;
