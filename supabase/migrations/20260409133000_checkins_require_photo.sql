-- Enforce foto obrigatória no check-in (server-side)

create or replace function public.checkins_require_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.foto_url is null or new.foto_url = '' then
    raise exception 'Foto obrigatória para registrar o treino';
  end if;
  return new;
end;
$$;

drop trigger if exists checkins_require_photo_trg on public.checkins;
create trigger checkins_require_photo_trg
  before insert on public.checkins
  for each row
  execute function public.checkins_require_photo();

