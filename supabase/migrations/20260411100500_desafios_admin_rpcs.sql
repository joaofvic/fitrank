-- Epic Desafios: RPCs administrativas para listagem cross-tenant e gestão de participantes.

-- -----------------------------------------------------------------------------
-- admin_desafios_list: listagem paginada com filtros e contagem de participantes
-- -----------------------------------------------------------------------------
create or replace function public.admin_desafios_list(
  p_tenant_id uuid default null,
  p_status text default null,
  p_from date default null,
  p_to date default null,
  p_search text default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  id uuid,
  tenant_id uuid,
  tenant_slug text,
  nome text,
  descricao text,
  status text,
  tipo_treino text[],
  data_inicio date,
  data_fim date,
  mes_referencia date,
  criado_por uuid,
  criado_por_nome text,
  max_participantes integer,
  participantes_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 30), 100));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.tenant_id,
    tn.slug as tenant_slug,
    d.nome,
    d.descricao,
    d.status,
    d.tipo_treino,
    d.data_inicio,
    d.data_fim,
    d.mes_referencia,
    d.criado_por,
    coalesce(nullif(trim(cp.display_name), ''), nullif(trim(cp.nome), ''), null) as criado_por_nome,
    d.max_participantes,
    (
      select count(*)
      from public.desafio_participantes dp
      where dp.desafio_id = d.id
    ) as participantes_count,
    d.created_at,
    d.updated_at
  from public.desafios d
  left join public.tenants tn on tn.id = d.tenant_id
  left join public.profiles cp on cp.id = d.criado_por
  where (p_tenant_id is null or d.tenant_id = p_tenant_id)
    and (p_status is null or d.status = p_status)
    and (p_from is null or coalesce(d.data_fim, d.mes_referencia) >= p_from)
    and (p_to is null or coalesce(d.data_inicio, d.mes_referencia) <= p_to)
    and (
      p_search is null
      or d.nome ilike '%' || p_search || '%'
      or d.descricao ilike '%' || p_search || '%'
    )
  order by d.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

comment on function public.admin_desafios_list is
  'Lista desafios cross-tenant com filtros. Apenas platform master.';

grant execute on function public.admin_desafios_list(
  uuid, text, date, date, text, int, int
) to authenticated;

-- -----------------------------------------------------------------------------
-- admin_desafio_participantes: ranking de um desafio (visão admin cross-tenant)
-- -----------------------------------------------------------------------------
create or replace function public.admin_desafio_participantes(
  p_desafio_id uuid,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  participante_id uuid,
  user_id uuid,
  nome_exibicao text,
  email text,
  pontos_desafio integer,
  inscrito_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select
    dp.id as participante_id,
    dp.user_id,
    coalesce(nullif(trim(pr.display_name), ''), nullif(trim(pr.nome), ''), 'Atleta')::text as nome_exibicao,
    au.email::text,
    dp.pontos_desafio,
    dp.created_at as inscrito_em
  from public.desafio_participantes dp
  inner join public.profiles pr on pr.id = dp.user_id
  inner join auth.users au on au.id = dp.user_id
  where dp.desafio_id = p_desafio_id
  order by dp.pontos_desafio desc, dp.user_id asc
  limit v_limit
  offset v_offset;
end;
$$;

comment on function public.admin_desafio_participantes is
  'Participantes de um desafio com ranking (visão admin). Apenas platform master.';

grant execute on function public.admin_desafio_participantes(
  uuid, int, int
) to authenticated;

-- -----------------------------------------------------------------------------
-- admin_desafio_detail: detalhe de um desafio específico (cross-tenant)
-- -----------------------------------------------------------------------------
create or replace function public.admin_desafio_detail(p_desafio_id uuid)
returns table (
  id uuid,
  tenant_id uuid,
  tenant_slug text,
  nome text,
  descricao text,
  status text,
  ativo boolean,
  tipo_treino text[],
  data_inicio date,
  data_fim date,
  mes_referencia date,
  criado_por uuid,
  criado_por_nome text,
  max_participantes integer,
  participantes_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_platform_master, false)
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.tenant_id,
    tn.slug as tenant_slug,
    d.nome,
    d.descricao,
    d.status,
    d.ativo,
    d.tipo_treino,
    d.data_inicio,
    d.data_fim,
    d.mes_referencia,
    d.criado_por,
    coalesce(nullif(trim(cp.display_name), ''), nullif(trim(cp.nome), ''), null) as criado_por_nome,
    d.max_participantes,
    (
      select count(*)
      from public.desafio_participantes dp
      where dp.desafio_id = d.id
    ) as participantes_count,
    d.created_at,
    d.updated_at
  from public.desafios d
  left join public.tenants tn on tn.id = d.tenant_id
  left join public.profiles cp on cp.id = d.criado_por
  where d.id = p_desafio_id;
end;
$$;

comment on function public.admin_desafio_detail is
  'Detalhe completo de um desafio (cross-tenant). Apenas platform master.';

grant execute on function public.admin_desafio_detail(uuid) to authenticated;
