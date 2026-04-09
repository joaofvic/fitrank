-- US-ADM-11: flags administrativas (sob revisão / ban) + auditoria

alter table public.profiles
  add column if not exists photo_under_review boolean not null default false,
  add column if not exists photo_under_review_at timestamptz,
  add column if not exists photo_under_review_by uuid references auth.users (id),
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_at timestamptz,
  add column if not exists banned_by uuid references auth.users (id),
  add column if not exists ban_reason text;

create table if not exists public.admin_user_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid references public.tenants (id) on delete set null,
  action text not null, -- set_under_review | reset_flags | ban | unban
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  acted_by uuid references auth.users (id),
  acted_at timestamptz not null default now()
);

create index if not exists admin_user_audit_user_idx
  on public.admin_user_audit (user_id, acted_at desc);

alter table public.admin_user_audit enable row level security;
-- acesso somente via Edge Function (service_role). Sem policies.

