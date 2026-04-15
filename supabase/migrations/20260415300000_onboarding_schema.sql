-- Onboarding: schema, RPCs e backfill
-- US-ONB-01, US-ONB-02, US-ONB-03, US-ONB-10

-- ============================================================
-- 1) Novas colunas em profiles
-- ============================================================

alter table public.profiles
  add column if not exists fitness_goal text,
  add column if not exists preferred_workout_types text[] not null default '{}',
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.profiles.fitness_goal is
  'Objetivo principal: emagrecer, ganhar_massa, resistencia, saude_geral';
comment on column public.profiles.preferred_workout_types is
  'Tipos de treino preferidos selecionados no onboarding';
comment on column public.profiles.onboarding_completed_at is
  'Timestamp de conclusao do onboarding; null = nao completou';

-- ============================================================
-- 2) Atualizar trigger para proteger onboarding_completed_at
-- ============================================================

create or replace function public.profiles_prevent_privilege_escalation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if current_setting('fitrank.internal_profile_update', true) = '1' then
      new.updated_at := now(); return new;
    end if;
    if new.is_platform_master is distinct from old.is_platform_master then raise exception 'Troca de is_platform_master proibida'; end if;
    if new.tenant_id is distinct from old.tenant_id then raise exception 'Troca de tenant_id proibida'; end if;
    if new.id is distinct from old.id then raise exception 'Troca de id proibida'; end if;
    if new.pontos is distinct from old.pontos then raise exception 'pontos: apenas servidor'; end if;
    if new.streak is distinct from old.streak then raise exception 'streak: apenas servidor'; end if;
    if new.is_pro is distinct from old.is_pro then raise exception 'is_pro: apenas servidor'; end if;
    if new.last_checkin_date is distinct from old.last_checkin_date then raise exception 'last_checkin_date: apenas servidor'; end if;
    if new.mp_payer_email is distinct from old.mp_payer_email then raise exception 'mp_payer_email: apenas servidor'; end if;
    if new.mp_payment_id is distinct from old.mp_payment_id then raise exception 'mp_payment_id: apenas servidor'; end if;
    if new.onboarding_completed_at is distinct from old.onboarding_completed_at then raise exception 'onboarding_completed_at: apenas servidor'; end if;
  end if;
  new.updated_at := now(); return new;
end; $$;

-- ============================================================
-- 3) Backfill: usuarios existentes marcados como onboarding concluido
-- ============================================================

do $$ begin
  perform set_config('fitrank.internal_profile_update', '1', true);
  update public.profiles set onboarding_completed_at = now() where onboarding_completed_at is null;
  perform set_config('fitrank.internal_profile_update', '', true);
end; $$;

-- ============================================================
-- 4) RPC publica: catalogo de tipos de treino (sem check admin)
-- ============================================================

create or replace function public.tipo_treino_catalog()
returns text[] language sql stable security definer set search_path = public as $$
  select array['Musculacao','Cardio','Funcional','Luta','Crossfit','Outro','Treino Geral']::text[];
$$;

grant execute on function public.tipo_treino_catalog() to authenticated;

comment on function public.tipo_treino_catalog is
  'Catalogo publico de tipos de treino (presets fixos) para onboarding e UI.';

-- ============================================================
-- 5) RPC: complete_onboarding
-- ============================================================

create or replace function public.complete_onboarding(
  p_fitness_goal text default null,
  p_preferred_workout_types text[] default '{}'
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_valid_goals text[] := array['emagrecer','ganhar_massa','resistencia','saude_geral'];
  v_valid_types text[] := array['Musculacao','Cardio','Funcional','Luta','Crossfit','Outro','Treino Geral'];
  v_type text;
begin
  if v_uid is null then raise exception 'Auth required'; end if;
  if p_fitness_goal is not null and p_fitness_goal <> '' then
    if not (p_fitness_goal = any(v_valid_goals)) then raise exception 'Invalid goal'; end if;
  else p_fitness_goal := null; end if;
  if p_preferred_workout_types is not null and array_length(p_preferred_workout_types, 1) > 0 then
    foreach v_type in array p_preferred_workout_types loop
      if not (v_type = any(v_valid_types)) then raise exception 'Invalid workout type'; end if;
    end loop;
  else p_preferred_workout_types := '{}'; end if;
  perform set_config('fitrank.internal_profile_update', '1', true);
  update public.profiles set fitness_goal = p_fitness_goal, preferred_workout_types = p_preferred_workout_types, onboarding_completed_at = now() where id = v_uid;
  perform set_config('fitrank.internal_profile_update', '', true);
end; $$;

grant execute on function public.complete_onboarding(text, text[]) to authenticated;

comment on function public.complete_onboarding is
  'Conclui o onboarding: salva objetivo, tipos de treino e marca timestamp.';
