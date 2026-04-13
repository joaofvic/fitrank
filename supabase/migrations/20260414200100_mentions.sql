-- Tabela de menções (@usuario) em legendas de check-ins

create table if not exists public.mentions (
  id                uuid primary key default gen_random_uuid(),
  checkin_id        uuid not null references public.checkins(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  mentioner_id      uuid not null references public.profiles(id) on delete cascade,
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  created_at        timestamptz not null default now(),
  unique (checkin_id, mentioned_user_id)
);

create index idx_mentions_checkin on public.mentions(checkin_id);
create index idx_mentions_mentioned on public.mentions(mentioned_user_id, created_at desc);

alter table public.mentions enable row level security;

create policy mentions_select on public.mentions
  for select to authenticated
  using (
    tenant_id = (select tenant_id from public.profiles where id = auth.uid())
  );

create policy mentions_insert on public.mentions
  for insert to authenticated
  with check (
    mentioner_id = auth.uid()
    and tenant_id = (select tenant_id from public.profiles where id = auth.uid())
  );

create policy mentions_delete on public.mentions
  for delete to authenticated
  using (mentioner_id = auth.uid());

-- Trigger: notificar usuário mencionado
create or replace function public.notify_on_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mentioner_name text;
begin
  if new.mentioned_user_id = new.mentioner_id then
    return new;
  end if;

  select coalesce(display_name, 'Alguém') into v_mentioner_name
  from public.profiles
  where id = new.mentioner_id;

  insert into public.notifications (user_id, tenant_id, type, title, body, data)
  values (
    new.mentioned_user_id,
    new.tenant_id,
    'mention',
    'Você foi mencionado!',
    v_mentioner_name || ' mencionou você em um treino.',
    jsonb_build_object('checkin_id', new.checkin_id, 'mentioner_id', new.mentioner_id)
  );

  return new;
end;
$$;

create trigger mentions_notify_trg
  after insert on public.mentions
  for each row execute function public.notify_on_mention();

-- RPC para persistir menções de forma segura (valida usernames e amizade)
create or replace function public.save_checkin_mentions(
  p_checkin_id uuid,
  p_usernames text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_checkin_owner uuid;
  v_username text;
  v_mentioned_id uuid;
begin
  select user_id, tenant_id into v_checkin_owner, v_tenant
  from public.checkins
  where id = p_checkin_id;

  if v_checkin_owner is null or v_checkin_owner != v_caller then
    raise exception 'Sem permissão para adicionar menções a este check-in';
  end if;

  if p_usernames is null or array_length(p_usernames, 1) is null then
    return;
  end if;

  foreach v_username in array p_usernames loop
    select id into v_mentioned_id
    from public.profiles
    where lower(username) = lower(v_username)
      and tenant_id = v_tenant
      and id != v_caller;

    if v_mentioned_id is not null then
      insert into public.mentions (checkin_id, mentioned_user_id, mentioner_id, tenant_id)
      values (p_checkin_id, v_mentioned_id, v_caller, v_tenant)
      on conflict (checkin_id, mentioned_user_id) do nothing;
    end if;
  end loop;
end;
$$;

grant execute on function public.save_checkin_mentions(uuid, text[]) to authenticated;

-- Atualizar get_friend_feed para incluir menções
DROP FUNCTION IF EXISTS public.get_friend_feed(int, int);

CREATE FUNCTION public.get_friend_feed(
  p_limit int default 10,
  p_offset int default 0
)
RETURNS TABLE (
  checkin_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  checkin_local_date date,
  tipo_treino text,
  foto_url text,
  points_awarded int,
  photo_review_status text,
  created_at timestamptz,
  likes_count bigint,
  comments_count bigint,
  has_liked boolean,
  feed_caption text,
  allow_comments boolean,
  hide_likes_count boolean,
  mentioned_usernames text[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.user_id,
    COALESCE(p.display_name, p.nome, 'Usuário'),
    p.avatar_url,
    c.checkin_local_date,
    c.tipo_treino,
    c.foto_url,
    c.points_awarded,
    c.photo_review_status,
    c.created_at,
    coalesce(l_agg.cnt, 0),
    coalesce(cm_agg.cnt, 0),
    exists (
      SELECT 1 FROM public.likes lk
      WHERE lk.checkin_id = c.id AND lk.user_id = auth.uid()
    ),
    c.feed_caption,
    c.allow_comments,
    c.hide_likes_count,
    coalesce(m_agg.usernames, '{}')
  FROM public.checkins c
  JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM public.likes WHERE checkin_id = c.id
  ) l_agg ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM public.comments WHERE checkin_id = c.id
  ) cm_agg ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(mp.username) AS usernames
    FROM public.mentions m
    JOIN public.profiles mp ON mp.id = m.mentioned_user_id
    WHERE m.checkin_id = c.id AND mp.username IS NOT NULL
  ) m_agg ON true
  WHERE c.tenant_id = public.current_tenant_id()
    AND c.photo_review_status = 'approved'
    AND c.feed_visible = true
    AND (
      c.user_id = auth.uid()
      OR public.are_friends(auth.uid(), c.user_id)
    )
  ORDER BY c.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;
