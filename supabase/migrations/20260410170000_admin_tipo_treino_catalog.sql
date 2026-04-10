-- Catálogo de tipos de treino para US-ADM-16 (multi-select sem texto livre).
-- União: presets oficiais + valores distintos já usados em checkins.

create or replace function public.admin_tipo_treino_catalog()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_platform_master, false)
    )
    then (
      select coalesce(array_agg(distinct x.t order by x.t), '{}')
      from (
        select unnest(array[
          'Musculação',
          'Cárdio',
          'Funcional',
          'Luta',
          'Crossfit',
          'Outro',
          'Treino Geral'
        ]::text[]) as t
        union
        select trim(c.tipo_treino)
        from public.checkins c
        where c.tipo_treino is not null
          and length(trim(c.tipo_treino)) > 0
      ) x
    )
    else '{}'::text[]
  end;
$$;

grant execute on function public.admin_tipo_treino_catalog() to authenticated;

comment on function public.admin_tipo_treino_catalog is
  'US-ADM-16: tipos de treino para isenção de foto (presets + distintos em checkins); só platform master vê lista completa.';
