---
name: Filtro modalidade em desafios
overview: Adicionar filtro de tipo de treino nas 3 triggers de pontuacao de desafios, para que check-ins so pontuem em desafios cujas modalidades correspondam. Admin adjust continua sem filtro (ajuste manual intencional).
todos:
  - id: migration-tipo-treino-filter
    content: Criar migration com CREATE OR REPLACE das 3 funcoes (bump, reject, reapprove) adicionando filtro AND (des.tipo_treino = '{}' OR new.tipo_treino = ANY(des.tipo_treino))
    status: pending
isProject: false
---

# Filtro de modalidade nos desafios

## Contexto

A tabela `desafios` ja possui a coluna `tipo_treino text[]` (adicionada em `20260411100000_desafios_evolve_schema.sql`). Quando o admin cria um desafio, seleciona os tipos de treino permitidos (ex: Musculacao, Crossfit). Porem, as 3 triggers que distribuem pontos para desafios **nao verificam** se o `tipo_treino` do check-in corresponde aos tipos do desafio. Todo check-in pontua em todo desafio ativo.

## Regra de negocio

- Check-in **sempre** soma pontos no `profiles.pontos` e no ranking geral (sem mudanca).
- Check-in **so pontua em um desafio** se:
  - O `desafios.tipo_treino` esta vazio (`'{}'`) -- qualquer treino conta (backward compat), **OU**
  - O `checkins.tipo_treino` esta contido em `desafios.tipo_treino`
- `admin_adjust_points` **nao deve filtrar** por tipo de treino -- ajuste manual e intencional.

## Condicao SQL a adicionar

A mesma condicao sera adicionada no `WHERE` do loop de desafios, nas 3 funcoes:

```sql
AND (des.tipo_treino = '{}' OR new.tipo_treino = ANY(des.tipo_treino))
```

## Funcoes afetadas

Todas definidas atualmente em [`supabase/migrations/20260411100400_bump_desafio_date_range.sql`](supabase/migrations/20260411100400_bump_desafio_date_range.sql):

### 1. `bump_desafio_points_on_checkin`

Trigger `AFTER INSERT ON checkins`. Adicionar a condicao no `WHERE` do `FOR r IN SELECT dp.id ...`:

```sql
WHERE dp.user_id = new.user_id
  AND des.tenant_id = new.tenant_id
  AND des.status = 'ativo'
  AND new.checkin_local_date >= coalesce(des.data_inicio, des.mes_referencia)
  AND new.checkin_local_date <= coalesce(des.data_fim, ...)
  AND (des.tipo_treino = '{}' OR new.tipo_treino = ANY(des.tipo_treino))  -- NOVO
```

### 2. `on_checkin_rejected_revert_points`

Trigger `AFTER UPDATE ON checkins` (rejeicao). Mesma condicao no loop de desafios para reverter apenas pontos que foram realmente somados.

### 3. `on_checkin_reapproved_reapply_points`

Trigger `AFTER UPDATE ON checkins` (reaprovacao). Mesma condicao no loop de desafios para reaplicar apenas pontos que realmente se aplicam.

### 4. `admin_adjust_points` -- SEM MUDANCA

O ajuste manual nao tem `tipo_treino` associado, entao continua afetando todos os desafios ativos no periodo. Isso e intencional: o admin esta fazendo um ajuste de override.

## Implementacao

Uma unica migration nova (`supabase/migrations/20260411100800_desafio_filter_tipo_treino.sql`) com `CREATE OR REPLACE FUNCTION` para as 3 funcoes.

## Impacto

- Desafios com `tipo_treino = '{}'` (array vazio) continuam aceitando todos os check-ins (backward compat).
- Desafios com tipos especificos (ex: `{Musculacao, Funcional}`) so recebem pontos de check-ins daqueles tipos.
- Nenhuma mudanca no frontend ou Edge Functions -- a logica e toda no banco.
