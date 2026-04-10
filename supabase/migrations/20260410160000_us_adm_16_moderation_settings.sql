-- US-ADM-16: configurações de moderação (motivos + políticas).

-- -----------------------------------------------------------------------------
-- Políticas globais (singleton)
-- -----------------------------------------------------------------------------
create table if not exists public.platform_moderation_settings (
  id text primary key default 'default' check (id = 'default'),
  auto_flag_rejection_count int not null default 5
    check (auto_flag_rejection_count >= 1 and auto_flag_rejection_count <= 500),
  auto_flag_window_days int not null default 7
    check (auto_flag_window_days >= 1 and auto_flag_window_days <= 365),
  photo_exempt_tipo_treino text[] not null default '{}',
  updated_at timestamptz not null default now()
);

insert into public.platform_moderation_settings (id)
values ('default')
on conflict (id) do nothing;

alter table public.platform_moderation_settings enable row level security;

-- -----------------------------------------------------------------------------
-- Flag automática no perfil (visível para admins na fila / detalhe)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists moderation_auto_flag boolean not null default false,
  add column if not exists moderation_auto_flag_at timestamptz;

comment on column public.profiles.moderation_auto_flag is
  'US-ADM-16: atingiu limiar de rejeições (X em Y dias) — revisar padrão.';

-- -----------------------------------------------------------------------------
-- Foto obrigatória: permite exceção por tipo de treino (lista no settings)
-- -----------------------------------------------------------------------------
create or replace function public.checkins_require_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  exempt text[];
  t text;
begin
  if new.foto_url is not null and length(trim(new.foto_url)) > 0 then
    return new;
  end if;

  select coalesce(photo_exempt_tipo_treino, '{}') into exempt
  from public.platform_moderation_settings
  where id = 'default'
  limit 1;

  if exempt is null or coalesce(array_length(exempt, 1), 0) = 0 then
    raise exception 'Foto obrigatória para registrar o treino';
  end if;

  t := trim(coalesce(new.tipo_treino, ''));
  if t <> '' and t = any (exempt) then
    return new;
  end if;

  raise exception 'Foto obrigatória para registrar o treino';
end;
$$;

-- -----------------------------------------------------------------------------
-- Auto-flag após rejeição: conta rejeições com data de decisão na janela Y
-- -----------------------------------------------------------------------------
create or replace function public.apply_moderation_auto_flag(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need int;
  v_days int;
  v_cnt bigint;
begin
  select auto_flag_rejection_count, auto_flag_window_days
  into v_need, v_days
  from public.platform_moderation_settings
  where id = 'default';

  if v_need is null or v_days is null then
    return;
  end if;

  select count(*)::bigint into v_cnt
  from public.checkins c
  where c.user_id = p_user_id
    and c.photo_review_status = 'rejected'
    and c.photo_reviewed_at is not null
    and c.photo_reviewed_at >= (now() - make_interval(days => v_days));

  if v_cnt >= v_need then
    update public.profiles
    set
      moderation_auto_flag = true,
      moderation_auto_flag_at = now()
    where id = p_user_id
      and coalesce(moderation_auto_flag, false) is distinct from true;
  end if;
end;
$$;

create or replace function public.checkins_after_reject_auto_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_moderation_auto_flag(new.user_id);
  return new;
end;
$$;

drop trigger if exists checkins_after_reject_auto_flag_trg on public.checkins;
create trigger checkins_after_reject_auto_flag_trg
  after update of photo_review_status on public.checkins
  for each row
  when (new.photo_review_status = 'rejected' and old.photo_review_status is distinct from new.photo_review_status)
  execute function public.checkins_after_reject_auto_flag();

-- -----------------------------------------------------------------------------
-- RPC: motivos de rejeição (CRUD para platform master)
-- -----------------------------------------------------------------------------
create or replace function public.admin_photo_rejection_reasons_list()
returns setof public.photo_rejection_reasons
language sql
stable
security definer
set search_path = public
as $$
  select r.*
  from public.photo_rejection_reasons r
  where exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_platform_master, false)
  )
  order by r.sort_order asc, r.code asc;
$$;

grant execute on function public.admin_photo_rejection_reasons_list() to authenticated;

create or replace function public.admin_photo_rejection_reasons_save(
  p_code text,
  p_label text,
  p_requires_note boolean,
  p_is_active boolean,
  p_sort_order int
)
returns public.photo_rejection_reasons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(coalesce(p_code, '')));
  row public.photo_rejection_reasons;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if v_code !~ '^[a-z][a-z0-9_]{0,62}$' or length(v_code) > 64 then
    raise exception 'Código inválido: comece com letra; use minúsculas, números e underscore (máx. 64).';
  end if;

  if length(trim(coalesce(p_label, ''))) < 1 then
    raise exception 'Rótulo obrigatório.';
  end if;

  insert into public.photo_rejection_reasons (code, label, requires_note, is_active, sort_order)
  values (v_code, trim(p_label), coalesce(p_requires_note, false), coalesce(p_is_active, true), coalesce(p_sort_order, 0))
  on conflict (code) do update
  set
    label = excluded.label,
    requires_note = excluded.requires_note,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order
  returning * into row;

  insert into public.platform_admin_audit_log (
    actor_id, action, target_type, target_id, tenant_id, payload
  ) values (
    auth.uid(),
    'moderation.reasons.save',
    'none',
    null,
    null,
    jsonb_build_object('code', row.code, 'label', row.label, 'is_active', row.is_active)
  );

  return row;
end;
$$;

grant execute on function public.admin_photo_rejection_reasons_save(text, text, boolean, boolean, int) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: políticas
-- -----------------------------------------------------------------------------
create or replace function public.admin_moderation_settings_get()
returns public.platform_moderation_settings
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.platform_moderation_settings s
  where s.id = 'default'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_platform_master, false)
    );
$$;

grant execute on function public.admin_moderation_settings_get() to authenticated;

create or replace function public.admin_moderation_settings_save(
  p_auto_flag_rejection_count int,
  p_auto_flag_window_days int,
  p_photo_exempt_tipo_treino text[]
)
returns public.platform_moderation_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.platform_moderation_settings;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_auto_flag_rejection_count is null or p_auto_flag_rejection_count < 1 or p_auto_flag_rejection_count > 500 then
    raise exception 'Limite de rejeições deve estar entre 1 e 500.';
  end if;
  if p_auto_flag_window_days is null or p_auto_flag_window_days < 1 or p_auto_flag_window_days > 365 then
    raise exception 'Janela (dias) deve estar entre 1 e 365.';
  end if;

  update public.platform_moderation_settings
  set
    auto_flag_rejection_count = p_auto_flag_rejection_count,
    auto_flag_window_days = p_auto_flag_window_days,
    photo_exempt_tipo_treino = coalesce(p_photo_exempt_tipo_treino, '{}'),
    updated_at = now()
  where id = 'default'
  returning * into s;

  insert into public.platform_admin_audit_log (
    actor_id, action, target_type, target_id, tenant_id, payload
  ) values (
    auth.uid(),
    'moderation.settings.save',
    'none',
    null,
    null,
    jsonb_build_object(
      'auto_flag_rejection_count', s.auto_flag_rejection_count,
      'auto_flag_window_days', s.auto_flag_window_days,
      'photo_exempt_tipo_treino', s.photo_exempt_tipo_treino
    )
  );

  return s;
end;
$$;

grant execute on function public.admin_moderation_settings_save(int, int, text[]) to authenticated;

comment on table public.platform_moderation_settings is
  'US-ADM-16: políticas globais (auto-flag, exceções de foto por tipo de treino).';

-- Leitura segura para o app: só expõe a lista de tipos isentos (sem autenticação master).
create or replace function public.checkin_photo_exempt_tipos()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(photo_exempt_tipo_treino, '{}')
  from public.platform_moderation_settings
  where id = 'default';
$$;

grant execute on function public.checkin_photo_exempt_tipos() to authenticated;

comment on function public.checkin_photo_exempt_tipos is
  'US-ADM-16: tipos de treino que podem registrar sem foto (vazio = todos exigem foto).';
