
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
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_platform_master, false)
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
      tn.region, pr.is_pro, pr.stripe_subscription_id, p_region, p_user_type, p_plan
    );

  select count(*) into v_with_photo
  from public.checkins c
  inner join public.profiles pr on pr.id = c.user_id
  inner join public.tenants tn on tn.id = c.tenant_id
  where c.checkin_local_date between p_start and p_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id)
    and public.admin_engagement_segment_match(
      tn.region, pr.is_pro, pr.stripe_subscription_id, p_region, p_user_type, p_plan
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
          tn.region, pr.is_pro, pr.stripe_subscription_id, p_region, p_user_type, p_plan
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
      tn.region, p.is_pro, p.stripe_subscription_id, p_region, p_user_type, p_plan
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
      tn.region, pr.is_pro, pr.stripe_subscription_id, p_region, p_user_type, p_plan
    );

  v_checkins_per_day := case
    when v_days > 0 then round(v_total_checkins::numeric / v_days::numeric, 4)
    else 0
  end;

  v_photo_rate := case
    when coalesce(v_total_checkins, 0) > 0 then round(v_with_photo::numeric / v_total_checkins::numeric, 6)
    else null
  end;

  v_rejection_rate := case
    when coalesce(v_mod_total, 0) > 0 then round(v_mod_rejected::numeric / v_mod_total::numeric, 6)
    else null
  end;

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'day', s.day,
          'checkins', coalesce(cc.n, 0),
          'dau', coalesce(cc.dau, 0),
          'new_profiles', coalesce(np.n, 0)
        )
        order by s.day
      )
      from (
        select generate_series(p_start, p_end, interval '1 day')::date as day
      ) s
      left join (
        select
          c.checkin_local_date as day,
          count(*)::int as n,
          count(distinct c.user_id)::int as dau
        from public.checkins c
        inner join public.profiles pr on pr.id = c.user_id
        inner join public.tenants tn on tn.id = c.tenant_id
        where c.checkin_local_date between p_start and p_end
          and (p_tenant_id is null or c.tenant_id = p_tenant_id)
          and public.admin_engagement_segment_match(
            tn.region, pr.is_pro, pr.stripe_subscription_id, p_region, p_user_type, p_plan
          )
        group by 1
      ) cc on cc.day = s.day
      left join (
        select
          (p.created_at at time zone 'America/Sao_Paulo')::date as day,
          count(*)::int as n
        from public.profiles p
        inner join public.tenants tn on tn.id = p.tenant_id
        where (p.created_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
          and (p_tenant_id is null or p.tenant_id = p_tenant_id)
          and public.admin_engagement_segment_match(
            tn.region, p.is_pro, p.stripe_subscription_id, p_region, p_user_type, p_plan
          )
        group by 1
      ) np on np.day = s.day
    ),
    '[]'::jsonb
  ) into v_series;

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('code', q.code, 'count', q.cnt)
        order by q.cnt desc
      )
      from (
        select
          coalesce(nullif(trim(c.photo_rejection_reason_code), ''), '(sem código)') as code,
          count(*)::int as cnt
        from public.checkins c
        inner join public.profiles pr on pr.id = c.user_id
        inner join public.tenants tn on tn.id = c.tenant_id
        where c.photo_review_status = 'rejected'
          and c.photo_reviewed_at is not null
          and (c.photo_reviewed_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
          and (p_tenant_id is null or c.tenant_id = p_tenant_id)
          and public.admin_engagement_segment_match(
            tn.region, pr.is_pro, pr.stripe_subscription_id, p_region, p_user_type, p_plan
          )
        group by 1
        order by cnt desc
        limit 10
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
    and public.admin_engagement_segment_match(
      tn.region, pr.is_pro, pr.stripe_subscription_id, p_region, p_user_type, p_plan
    );

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'rank', z.rk,
          'code', z.code,
          'count', z.cnt,
          'pct',
          case
            when v_rej_total > 0 then round(z.cnt::numeric / v_rej_total::numeric, 6)
            else null
          end
        )
        order by z.rk
      )
      from (
        select
          g.code,
          g.cnt,
          row_number() over (order by g.cnt desc) as rk
        from (
          select
            coalesce(nullif(trim(c.photo_rejection_reason_code), ''), '(sem código)') as code,
            count(*)::int as cnt
          from public.checkins c
          inner join public.profiles pr on pr.id = c.user_id
          inner join public.tenants tn on tn.id = c.tenant_id
          where c.photo_review_status = 'rejected'
            and c.photo_reviewed_at is not null
            and (c.photo_reviewed_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
            and (p_tenant_id is null or c.tenant_id = p_tenant_id)
            and public.admin_engagement_segment_match(
              tn.region, pr.is_pro, pr.stripe_subscription_id, p_region, p_user_type, p_plan
            )
          group by 1
        ) g
      ) z
    ),
    '[]'::jsonb
  ) into v_rejection_ranking;

  return jsonb_build_object(
    'period',
    jsonb_build_object(
      'start', p_start,
      'end', p_end,
      'days', v_days,
      'tenant_id', p_tenant_id,
      'region', p_region,
      'user_type', p_user_type,
      'plan', p_plan,
      'timezone',
      'America/Sao_Paulo'
    ),
    'summary',
    jsonb_build_object(
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
    'rejection_breakdown',
    jsonb_build_object(
      'total_rejected', coalesce(v_rej_total, 0),
      'reasons', coalesce(v_rejection_ranking, '[]'::jsonb)
    ),
    'series', jsonb_build_object('by_day', v_series)
  );
end;
$$;

comment on function public.admin_engagement_metrics(date, date, uuid, text, text, text) is
  'KPIs de engajamento e moderação por período/tenant/segmento; datas a partir de timestamptz em America/Sao_Paulo; apenas is_platform_master.';

grant execute on function public.admin_engagement_metrics(date, date, uuid, text, text, text) to authenticated;
