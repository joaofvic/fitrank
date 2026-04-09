-- US-ADM-14: segmentação (tenant + região + tipo + plano) nas métricas de engajamento

alter table public.tenants
  add column if not exists region text;

comment on column public.tenants.region is
  'Região opcional da academia (ex.: SP, Sul); usada em filtros do admin de engajamento.';

-- Predicado reutilizado nas RPCs admin (não exposto ao cliente)
create or replace function public.admin_engagement_segment_match(
  p_tenant_region text,
  p_pr_is_pro boolean,
  p_pr_stripe_sub text,
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
        and coalesce(nullif(trim(p_pr_stripe_sub), ''), '') = ''
      )
      or (
        lower(p_plan) = 'paid'
        and (
          p_pr_is_pro
          or coalesce(nullif(trim(p_pr_stripe_sub), ''), '') <> ''
        )
      )
    );
$$;

revoke all on function public.admin_engagement_segment_match(text, boolean, text, text, text, text) from public;
