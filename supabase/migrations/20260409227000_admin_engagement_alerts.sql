-- US-ADM-14: alertas operacionais (24h vs 24h anteriores, America/Sao_Paulo)

create or replace function public.admin_engagement_alerts(p_tenant_id uuid default null)
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
  n_curr int;
  n_prev int;
  dec_curr int;
  dec_prev int;
  rej_curr int;
  rej_prev int;
  rate_curr numeric;
  rate_prev numeric;
  rel_inc numeric;
  h_curr numeric;
  h_prev numeric;
  wf_curr int;
  wf_prev int;
  tot_curr int;
  tot_prev int;
  pr_curr numeric;
  pr_prev numeric;
  drop_pct int;
  msg text;
  sev text;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  t_end := now();
  t_curr_start := (timezone(v_tz, t_end) - interval '24 hours') AT TIME ZONE v_tz;
  t_prev_start := (timezone(v_tz, t_end) - interval '48 hours') AT TIME ZONE v_tz;
  t_prev_end := t_curr_start;

  -- Check-ins (por created_at; janelas alinhadas ao relógio local SP)
  select count(*)::int
  into n_curr
  from public.checkins c
  where c.created_at >= t_curr_start
    and c.created_at < t_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id);

  select count(*)::int
  into n_prev
  from public.checkins c
  where c.created_at >= t_prev_start
    and c.created_at < t_prev_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id);

  if n_prev >= 5 and n_curr::numeric < n_prev * 0.7 then
    drop_pct := greatest(1, least(100, round((n_prev - n_curr)::numeric / n_prev * 100.0)::int));
    sev := case when n_curr::numeric < n_prev * 0.5 then 'critical' else 'warning' end;
    msg := format(
      '⚠️ Check-ins caíram ~%s%% nas últimas 24h (vs 24h anteriores: %s → %s).',
      drop_pct,
      n_prev,
      n_curr
    );
    v_out :=
      v_out
      || jsonb_build_array(
        jsonb_build_object(
          'id',
          'checkins_drop',
          'severity',
          sev,
          'message',
          msg,
          'meta',
          jsonb_build_object('prev_24h', n_prev, 'last_24h', n_curr, 'drop_pct', drop_pct, 'timezone', v_tz)
        )
      );
  end if;

  -- Decisões de moderação com foto (por photo_reviewed_at)
  select
    count(*) filter (where c.photo_review_status = 'rejected')::int,
    count(*)::int
  into rej_curr, dec_curr
  from public.checkins c
  where c.foto_url is not null
    and length(trim(c.foto_url)) > 0
    and c.photo_reviewed_at is not null
    and c.photo_reviewed_at >= t_curr_start
    and c.photo_reviewed_at < t_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id);

  select
    count(*) filter (where c.photo_review_status = 'rejected')::int,
    count(*)::int
  into rej_prev, dec_prev
  from public.checkins c
  where c.foto_url is not null
    and length(trim(c.foto_url)) > 0
    and c.photo_reviewed_at is not null
    and c.photo_reviewed_at >= t_prev_start
    and c.photo_reviewed_at < t_prev_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id);

  rate_curr := case when dec_curr > 0 then rej_curr::numeric / dec_curr::numeric else 0 end;
  rate_prev := case when dec_prev > 0 then rej_prev::numeric / dec_prev::numeric else 0 end;

  if dec_curr >= 5 and dec_prev >= 5 and rate_prev >= 0.03 then
    rel_inc := (rate_curr - rate_prev) / rate_prev;
    if rel_inc >= 0.35 then
      msg := format(
        '⚠️ Rejeição subiu ~%s%% nas últimas 24h (taxa %.1f%% → %.1f%%; %s/%s vs %s/%s decisões).',
        round(rel_inc * 100.0)::int,
        round(rate_prev * 1000.0) / 10.0,
        round(rate_curr * 1000.0) / 10.0,
        rej_curr,
        dec_curr,
        rej_prev,
        dec_prev
      );
      sev := case when rel_inc >= 0.6 then 'critical' else 'warning' end;
      v_out :=
        v_out
        || jsonb_build_array(
          jsonb_build_object(
            'id',
            'rejection_spike',
            'severity',
            sev,
            'message',
            msg,
            'meta',
            jsonb_build_object(
              'rate_prev',
              rate_prev,
              'rate_curr',
              rate_curr,
              'relative_increase',
              rel_inc,
              'timezone',
              v_tz
            )
          )
        );
    end if;
  elsif dec_curr >= 8 and dec_prev >= 3 and rate_prev < 0.02 and rate_curr >= 0.2 then
    v_out :=
      v_out
      || jsonb_build_array(
        jsonb_build_object(
          'id',
          'rejection_spike',
          'severity',
          'warning',
          'message',
          format(
            '⚠️ Taxa de rejeição elevada nas últimas 24h (~%.1f%% em %s decisões).',
            round(rate_curr * 1000.0) / 10.0,
            dec_curr
          ),
          'meta',
          jsonb_build_object('rate_curr', rate_curr, 'decisions', dec_curr, 'timezone', v_tz)
        )
      );
  end if;

  -- Tempo até moderação (horas)
  select avg(extract(epoch from (c.photo_reviewed_at - c.created_at)) / 3600.0)
  into h_curr
  from public.checkins c
  where c.foto_url is not null
    and length(trim(c.foto_url)) > 0
    and c.photo_reviewed_at is not null
    and c.photo_reviewed_at >= t_curr_start
    and c.photo_reviewed_at < t_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id);

  select avg(extract(epoch from (c.photo_reviewed_at - c.created_at)) / 3600.0)
  into h_prev
  from public.checkins c
  where c.foto_url is not null
    and length(trim(c.foto_url)) > 0
    and c.photo_reviewed_at is not null
    and c.photo_reviewed_at >= t_prev_start
    and c.photo_reviewed_at < t_prev_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id);

  if dec_curr >= 3 and h_curr is not null then
    if h_curr >= 8.0 or (h_curr >= 6.0 and h_prev is not null and h_prev > 0 and h_curr >= h_prev * 1.35) then
      msg := format(
        '⚠️ Tempo médio até moderação alto nas últimas 24h (~%s h; antes ~%s h).',
        round(h_curr * 10.0) / 10.0,
        case when h_prev is null then '—' else (round(h_prev * 10.0) / 10.0)::text end
      );
      sev := case when h_curr >= 12.0 then 'critical' else 'warning' end;
      v_out :=
        v_out
        || jsonb_build_array(
          jsonb_build_object(
            'id',
            'moderation_slow',
            'severity',
            sev,
            'message',
            msg,
            'meta',
            jsonb_build_object('avg_hours_curr', h_curr, 'avg_hours_prev', h_prev, 'timezone', v_tz)
          )
        );
    end if;
  end if;

  -- Taxa de check-in com foto (por created_at)
  select
    count(*) filter (
      where c.foto_url is not null
        and length(trim(c.foto_url)) > 0
    )::int,
    count(*)::int
  into wf_curr, tot_curr
  from public.checkins c
  where c.created_at >= t_curr_start
    and c.created_at < t_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id);

  select
    count(*) filter (
      where c.foto_url is not null
        and length(trim(c.foto_url)) > 0
    )::int,
    count(*)::int
  into wf_prev, tot_prev
  from public.checkins c
  where c.created_at >= t_prev_start
    and c.created_at < t_prev_end
    and (p_tenant_id is null or c.tenant_id = p_tenant_id);

  pr_curr := case when tot_curr > 0 then wf_curr::numeric / tot_curr::numeric else 0 end;
  pr_prev := case when tot_prev > 0 then wf_prev::numeric / tot_prev::numeric else 0 end;

  if tot_curr >= 10 and pr_curr < 0.5 then
    v_out :=
      v_out
      || jsonb_build_array(
        jsonb_build_object(
          'id',
          'photo_rate_low',
          'severity',
          'warning',
          'message',
          format(
            '⚠️ Taxa de check-ins com foto baixa nas últimas 24h (~%.0f%%; %s/%s).',
            round(pr_curr * 100.0),
            wf_curr,
            tot_curr
          ),
          'meta',
          jsonb_build_object('photo_rate', pr_curr, 'with_photo', wf_curr, 'total', tot_curr, 'timezone', v_tz)
        )
      );
  elsif tot_curr >= 10
    and tot_prev >= 10
    and pr_prev - pr_curr >= 0.12 then
    v_out :=
      v_out
      || jsonb_build_array(
        jsonb_build_object(
          'id',
          'photo_rate_low',
          'severity',
          'warning',
          'message',
          format(
            '⚠️ Taxa de foto caiu ~%s p.p. nas últimas 24h (%.0f%% → %.0f%%).',
            round((pr_prev - pr_curr) * 100.0)::int,
            round(pr_prev * 100.0),
            round(pr_curr * 100.0)
          ),
          'meta',
          jsonb_build_object('photo_rate_prev', pr_prev, 'photo_rate_curr', pr_curr, 'timezone', v_tz)
        )
      );
  end if;

  return v_out;
end;
$$;

comment on function public.admin_engagement_alerts(uuid) is
  'Alertas operacionais (24h vs 24h anteriores); janelas em instantes alinhados a America/Sao_Paulo; apenas is_platform_master.';

grant execute on function public.admin_engagement_alerts(uuid) to authenticated;
