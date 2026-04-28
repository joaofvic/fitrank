-- Epic 3 (desafios-ranking-privado): ranking para participantes (janela)
-- - Retorna somente 1 acima + eu + 1 abaixo (configurável por p_window)
-- - Inclui my_rank (posição do usuário) sem expor contagem total

drop function if exists public.get_my_desafio_ranking_window(uuid, integer);

create or replace function public.get_my_desafio_ranking_window(
  p_desafio_id uuid,
  p_window integer default 1
)
returns table (
  user_id uuid,
  nome_exibicao text,
  pontos_desafio integer,
  is_me boolean,
  avatar_url text,
  rank integer,
  my_rank integer
)
language sql
stable
security definer
set search_path = public
as $$
  with des as (
    select d.*
    from public.desafios d
    where d.id = p_desafio_id
      and d.tenant_id = public.current_tenant_id()
    limit 1
  ),
  ranked as (
    select
      dp.user_id,
      coalesce(nullif(trim(pr.display_name), ''), nullif(trim(pr.nome), ''), 'Atleta')::text as nome_exibicao,
      dp.pontos_desafio,
      (dp.user_id = auth.uid()) as is_me,
      pr.avatar_url::text as avatar_url,
      row_number() over (order by dp.pontos_desafio desc, dp.user_id asc)::integer as rank
    from public.desafio_participantes dp
    inner join des d on d.id = dp.desafio_id
    inner join public.profiles pr on pr.id = dp.user_id
    where pr.tenant_id = public.current_tenant_id()
  ),
  me as (
    select r.rank as my_rank
    from ranked r
    where r.user_id = auth.uid()
    limit 1
  )
  select
    r.user_id,
    r.nome_exibicao,
    r.pontos_desafio,
    r.is_me,
    r.avatar_url,
    r.rank,
    me.my_rank::integer
  from ranked r
  cross join me
  where exists (select 1 from me) -- só participantes
    and r.rank between greatest(1, me.my_rank - greatest(coalesce(p_window, 1), 1))
                 and (me.my_rank + greatest(coalesce(p_window, 1), 1))
  order by r.rank asc;
$$;

grant execute on function public.get_my_desafio_ranking_window(uuid, integer) to authenticated;

