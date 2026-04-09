-- US-ADM-12: ledger de ajustes manuais de pontos (com trilha)
-- Preferimos registrar em ledger e manter totals em profiles.pontos via função security definer.

create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null,
  category text not null default 'manual',
  reason text not null,
  reference text,
  effective_date date not null default current_date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  points_before integer,
  points_after integer
);

create index if not exists points_ledger_user_created_idx
  on public.points_ledger (user_id, created_at desc);

create index if not exists points_ledger_tenant_created_idx
  on public.points_ledger (tenant_id, created_at desc);

alter table public.points_ledger enable row level security;

-- Função admin: aplica ajuste e grava ledger
create or replace function public.admin_adjust_points(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_reference text,
  p_actor uuid,
  p_effective_date date default current_date,
  p_category text default 'manual'
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
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'delta inválido';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason obrigatória';
  end if;

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

  insert into public.points_ledger (
    tenant_id,
    user_id,
    delta,
    category,
    reason,
    reference,
    effective_date,
    created_by,
    points_before,
    points_after
  ) values (
    v_tenant,
    p_user_id,
    p_delta,
    coalesce(nullif(trim(coalesce(p_category, '')), ''), 'manual'),
    trim(p_reason),
    nullif(trim(coalesce(p_reference, '')), ''),
    coalesce(p_effective_date, current_date),
    p_actor,
    v_before,
    v_after
  )
  returning * into v_row;

  return v_row;
end;
$$;

