-- Epic 4 (desafios-ranking-privado): ranking completo apenas para participantes e apenas enquanto ativo
-- - Não expõe contagem total explicitamente
-- - Se não ativo ou não participante: retorna vazio

drop function if exists public.get_desafio_ranking_full_active(uuid);

create or replace function public.get_desafio_ranking_full_active(p_desafio_id uuid)
returns table (
  user_id uuid,
  nome_exibicao text,
  pontos_desafio integer,
  is_me boolean,
  avatar_url text,
  rank integer
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
      and d.ativo = true
      and d.data_inicio is not null
      and d.data_fim is not null
      and current_date between d.data_inicio and d.data_fim
    limit 1
  ),
  me_ok as (
    select 1 as ok
    from public.desafio_participantes dp_me
    inner join des d on d.id = dp_me.desafio_id
    where dp_me.user_id = auth.uid()
    limit 1
  )
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
    and exists (select 1 from me_ok)
  order by dp.pontos_desafio desc, dp.user_id asc;
$$;

grant execute on function public.get_desafio_ranking_full_active(uuid) to authenticated;

