-- Epic Social: função helper are_friends() usada nas policies de likes e comments

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and tenant_id = public.current_tenant_id()
      and least(requester_id, addressee_id) = least(a, b)
      and greatest(requester_id, addressee_id) = greatest(a, b)
  );
$$;
