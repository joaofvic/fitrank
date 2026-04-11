-- Adiciona configuracao de premiacao aos desafios:
-- reward_winners_count: quantos usuarios serao premiados
-- reward_distribution_type: 'equal' (divisao igual) ou 'weighted' (proporcional ao ranking)

-- =============================================================
-- 1. Novas colunas
-- =============================================================
ALTER TABLE public.desafios
  ADD COLUMN IF NOT EXISTS reward_winners_count integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS reward_distribution_type text NOT NULL DEFAULT 'weighted';

ALTER TABLE public.desafios
  ADD CONSTRAINT desafios_reward_distribution_check
  CHECK (reward_distribution_type IN ('equal', 'weighted'));

ALTER TABLE public.desafios
  ADD CONSTRAINT desafios_reward_winners_check
  CHECK (reward_winners_count >= 1 AND reward_winners_count <= 50);

-- =============================================================
-- 2. Atualizar RPC admin_desafios_list para retornar novos campos
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_desafios_list(
  p_tenant_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 30,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
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
  reward_winners_count integer,
  reward_distribution_type text,
  participantes_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := greatest(1, least(coalesce(p_limit, 30), 100));
  v_offset int := greatest(0, coalesce(p_offset, 0));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND coalesce(p.is_platform_master, false)
  ) THEN
    RAISE EXCEPTION 'Acesso negado' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.tenant_id,
    tn.slug AS tenant_slug,
    d.nome,
    d.descricao,
    d.status,
    d.tipo_treino,
    d.data_inicio,
    d.data_fim,
    d.mes_referencia,
    d.criado_por,
    coalesce(nullif(trim(cp.display_name), ''), nullif(trim(cp.nome), ''), null) AS criado_por_nome,
    d.max_participantes,
    d.reward_winners_count,
    d.reward_distribution_type,
    (SELECT count(*) FROM public.desafio_participantes dp WHERE dp.desafio_id = d.id) AS participantes_count,
    d.created_at,
    d.updated_at
  FROM public.desafios d
  LEFT JOIN public.tenants tn ON tn.id = d.tenant_id
  LEFT JOIN public.profiles cp ON cp.id = d.criado_por
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_from IS NULL OR coalesce(d.data_fim, d.mes_referencia) >= p_from)
    AND (p_to IS NULL OR coalesce(d.data_inicio, d.mes_referencia) <= p_to)
    AND (
      p_search IS NULL
      OR d.nome ILIKE '%' || p_search || '%'
      OR d.descricao ILIKE '%' || p_search || '%'
    )
  ORDER BY d.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

-- =============================================================
-- 3. Atualizar RPC admin_desafio_detail para retornar novos campos
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_desafio_detail(p_desafio_id uuid)
RETURNS TABLE (
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
  reward_winners_count integer,
  reward_distribution_type text,
  participantes_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND coalesce(p.is_platform_master, false)
  ) THEN
    RAISE EXCEPTION 'Acesso negado' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.tenant_id,
    tn.slug AS tenant_slug,
    d.nome,
    d.descricao,
    d.status,
    d.ativo,
    d.tipo_treino,
    d.data_inicio,
    d.data_fim,
    d.mes_referencia,
    d.criado_por,
    coalesce(nullif(trim(cp.display_name), ''), nullif(trim(cp.nome), ''), null) AS criado_por_nome,
    d.max_participantes,
    d.reward_winners_count,
    d.reward_distribution_type,
    (SELECT count(*) FROM public.desafio_participantes dp WHERE dp.desafio_id = d.id) AS participantes_count,
    d.created_at,
    d.updated_at
  FROM public.desafios d
  LEFT JOIN public.tenants tn ON tn.id = d.tenant_id
  LEFT JOIN public.profiles cp ON cp.id = d.criado_por
  WHERE d.id = p_desafio_id;
END;
$$;
