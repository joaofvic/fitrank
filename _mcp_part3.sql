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

  v_lim := least(greatest(coalesce(p_limit, 12), 1), 30);

  return coalesce(
    (
      select jsonb_agg(to_jsonb(x) order by x.photo_reviewed_at desc nulls last)
      from (
        select
          c.id,
          c.user_id,
          c.tenant_id,
          tn.slug as tenant_slug,
          tn.name as tenant_name,
          c.checkin_local_date,
          c.tipo_treino,
          c.foto_url,
          c.photo_rejection_note,
          c.photo_reviewed_at,
          c.photo_rejection_reason_code,
          c.created_at
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
  'Lista exemplos de check-ins rejeitados; data da decisão em America/Sao_Paulo; apenas is_platform_master.';

grant execute on function public.admin_rejection_examples(date, date, uuid, text, int, text, text, text) to authenticated;
