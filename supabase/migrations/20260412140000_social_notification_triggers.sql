-- Triggers de notificação para eventos sociais: follow request, follow accepted, comentário.

-- 1. notify_on_friend_request ---------------------------------------------------------
-- Quando alguém envia uma solicitação de amizade, notifica o destinatário.
create or replace function public.notify_on_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.status != 'pending' then
    return new;
  end if;

  select coalesce(p.display_name, p.nome, 'Alguém')
  into v_name
  from public.profiles p
  where p.id = new.requester_id;

  insert into public.notifications (user_id, tenant_id, type, title, body, data)
  values (
    new.addressee_id,
    new.tenant_id,
    'friend_request',
    'Nova solicitação de amizade',
    v_name || ' quer te seguir.',
    jsonb_build_object(
      'friendship_id', new.id,
      'requester_id', new.requester_id
    )
  );

  return new;
end;
$$;

create trigger friendships_notify_request_trg
  after insert on public.friendships
  for each row
  execute function public.notify_on_friend_request();

-- 2. notify_on_friend_accepted --------------------------------------------------------
-- Quando uma solicitação é aceita, notifica quem enviou o pedido.
create or replace function public.notify_on_friend_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.status is distinct from 'accepted' then
    return new;
  end if;
  if old.status is not distinct from 'accepted' then
    return new;
  end if;

  select coalesce(p.display_name, p.nome, 'Alguém')
  into v_name
  from public.profiles p
  where p.id = new.addressee_id;

  insert into public.notifications (user_id, tenant_id, type, title, body, data)
  values (
    new.requester_id,
    new.tenant_id,
    'friend_accepted',
    'Solicitação aceita!',
    v_name || ' aceitou sua solicitação.',
    jsonb_build_object(
      'friendship_id', new.id,
      'addressee_id', new.addressee_id
    )
  );

  return new;
end;
$$;

create trigger friendships_notify_accepted_trg
  after update of status on public.friendships
  for each row
  execute function public.notify_on_friend_accepted();

-- 3. notify_on_comment ----------------------------------------------------------------
-- Quando alguém comenta em um check-in, notifica o dono do check-in.
-- Pula se o comentarista é o próprio dono (sem auto-notificação).
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkin_owner_id uuid;
  v_checkin_tenant_id uuid;
  v_foto_url text;
  v_commenter_name text;
begin
  select c.user_id, c.tenant_id, c.foto_url
  into v_checkin_owner_id, v_checkin_tenant_id, v_foto_url
  from public.checkins c
  where c.id = new.checkin_id;

  if v_checkin_owner_id is null then
    return new;
  end if;

  if new.user_id = v_checkin_owner_id then
    return new;
  end if;

  select coalesce(p.display_name, p.nome, 'Alguém')
  into v_commenter_name
  from public.profiles p
  where p.id = new.user_id;

  insert into public.notifications (user_id, tenant_id, type, title, body, data)
  values (
    v_checkin_owner_id,
    v_checkin_tenant_id,
    'comment',
    'Novo comentário',
    v_commenter_name || ' comentou no seu treino.',
    jsonb_build_object(
      'comment_id', new.id,
      'checkin_id', new.checkin_id,
      'commenter_id', new.user_id,
      'foto_url', v_foto_url
    )
  );

  return new;
end;
$$;

create trigger comments_notify_owner_trg
  after insert on public.comments
  for each row
  execute function public.notify_on_comment();
