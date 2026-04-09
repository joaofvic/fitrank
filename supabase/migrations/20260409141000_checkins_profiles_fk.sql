-- Permite embed de profiles via PostgREST (Edge Functions)
-- checkins.user_id -> profiles.id

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'checkins_user_profile_fkey'
      and conrelid = 'public.checkins'::regclass
  ) then
    alter table public.checkins
      add constraint checkins_user_profile_fkey
      foreign key (user_id) references public.profiles (id)
      on delete cascade;
  end if;
end;
$$;

