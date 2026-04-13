-- Epic 6: Monetização — tabelas subscription_plans e subscriptions

-- ============================================================
-- 1) subscription_plans — catálogo local sincronizado com Stripe
-- ============================================================

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  stripe_product_id text unique not null,
  stripe_price_id text unique not null,
  name text not null,
  description text,
  price_amount integer not null,
  currency text not null default 'brl',
  "interval" text not null check ("interval" in ('month', 'year')),
  interval_count integer not null default 1,
  features jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscription_plans_active_idx
  on public.subscription_plans (is_active, sort_order)
  where is_active = true;

comment on table public.subscription_plans is
  'Catálogo de planos de assinatura sincronizados com Stripe Products/Prices.';
comment on column public.subscription_plans.price_amount is
  'Valor em centavos (ex: 2990 = R$ 29,90).';
comment on column public.subscription_plans.features is
  'Array JSON de strings descrevendo benefícios do plano.';
comment on column public.subscription_plans.limits is
  'Objeto JSON com limites de uso (ex: {"max_checkins_day": 5}).';

alter table public.subscription_plans enable row level security;

create policy subscription_plans_select_public
  on public.subscription_plans
  for select
  to authenticated
  using (is_active = true);

-- ============================================================
-- 2) subscriptions — registro local de cada assinatura ativa
-- ============================================================

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  plan_id uuid references public.subscription_plans (id) on delete set null,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'canceled', 'paused', 'unpaid', 'incomplete')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_idx on public.subscriptions (user_id);
create index subscriptions_tenant_idx on public.subscriptions (tenant_id);
create index subscriptions_status_idx on public.subscriptions (status) where status = 'active';
create index subscriptions_stripe_customer_idx on public.subscriptions (stripe_customer_id);

comment on table public.subscriptions is
  'Espelho local das assinaturas Stripe por usuário/tenant.';

alter table public.subscriptions enable row level security;

create policy subscriptions_select_own
  on public.subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 3) Trigger para atualizar updated_at automaticamente
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger subscription_plans_updated_at
  before update on public.subscription_plans
  for each row
  execute function public.set_updated_at();

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- 4) RPCs administrativas para consultas de billing
-- ============================================================

create or replace function public.admin_list_subscription_plans()
returns setof public.subscription_plans
language sql
security definer
set search_path = public
as $$
  select *
  from public.subscription_plans
  order by sort_order, created_at;
$$;

comment on function public.admin_list_subscription_plans() is
  'Lista todos os planos (ativos e inativos) para admin.';

grant execute on function public.admin_list_subscription_plans() to authenticated;

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
  stripe_subscription_id text,
  stripe_customer_id text,
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
    s.stripe_subscription_id,
    s.stripe_customer_id,
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
  'Lista assinaturas com dados de usuário/tenant/plano para admin.';

grant execute on function public.admin_list_subscriptions(text, uuid, integer, integer) to authenticated;

create or replace function public.admin_billing_metrics()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  select json_build_object(
    'active_subscriptions', (
      select count(*) from public.subscriptions where status = 'active'
    ),
    'trialing_subscriptions', (
      select count(*) from public.subscriptions where status = 'trialing'
    ),
    'past_due_subscriptions', (
      select count(*) from public.subscriptions where status = 'past_due'
    ),
    'paused_subscriptions', (
      select count(*) from public.subscriptions where status = 'paused'
    ),
    'canceled_last_30d', (
      select count(*) from public.subscriptions
      where status = 'canceled'
        and canceled_at >= now() - interval '30 days'
    ),
    'mrr_cents', (
      select coalesce(sum(
        case
          when sp."interval" = 'year' then sp.price_amount / (sp.interval_count * 12)
          else sp.price_amount / sp.interval_count
        end
      ), 0)
      from public.subscriptions s
      join public.subscription_plans sp on sp.id = s.plan_id
      where s.status in ('active', 'trialing')
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.admin_billing_metrics() is
  'Retorna métricas agregadas de billing para o dashboard admin.';

grant execute on function public.admin_billing_metrics() to authenticated;
