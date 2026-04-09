-- US-ADM-07: motivos padronizados + flag suspeito/fraude

alter table public.checkins
  add column if not exists photo_is_suspected boolean not null default false;

create index if not exists checkins_photo_is_suspected_idx
  on public.checkins (photo_is_suspected)
  where photo_is_suspected is true;

