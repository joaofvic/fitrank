-- Epic 1 (desafios-ranking-privado): privacidade de inscritos
-- - Remove contagens do payload público (participant_count / max_participantes)
-- - Mantém UX de inscrição via booleano is_full calculado no servidor

drop function if exists public.get_challenges_with_counts(uuid);

create or replace function public.get_challenges_with_counts(p_tenant_id uuid)
returns table (
  id uuid,
  nome text,
  descricao text,
  data_inicio date,
  data_fim date,
  tipo_treino text[],
  reward_winners_count integer,
  reward_distribution_type text,
  entry_fee integer,
  is_enrolled boolean,
  is_full boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.nome,
    d.descricao,
    d.data_inicio,
    d.data_fim,
    d.tipo_treino,
    d.reward_winners_count,
    d.reward_distribution_type,
    d.entry_fee,
    exists (
      select 1
      from public.desafio_participantes dp
      where dp.desafio_id = d.id
        and dp.user_id = auth.uid()
    ) as is_enrolled,
    case
      when d.max_participantes is null then false
      else (
        (select count(*)
         from public.desafio_participantes dp2
         where dp2.desafio_id = d.id) >= d.max_participantes
      )
    end as is_full
  from public.desafios d
  where d.tenant_id = p_tenant_id
  order by d.data_inicio desc, d.id asc;
$$;

grant execute on function public.get_challenges_with_counts(uuid) to authenticated;

