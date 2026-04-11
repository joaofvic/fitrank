---
name: Fix streak re-rejection bug
overview: Corrigir bug onde o streak não é recalculado quando um check-in retentado (photo retry) é rejeitado novamente, porque o guard `points_reverted_at IS NOT NULL` causa early return no trigger, pulando tanto a reversão de pontos (correto) quanto o recompute de streak (incorreto).
todos:
  - id: migration-fix
    content: Criar migration SQL corrigindo on_checkin_rejected_revert_points (recompute streak na re-rejeicao), retry_rejected_checkin (recompute streak no retry), e backfill de streaks
    status: completed
  - id: db-push
    content: Aplicar migration no Supabase via db push
    status: completed
isProject: false
---

# Correção: Streak não diminui após re-rejeição de check-in retentado

## Causa Raiz

O fluxo completo do bug:

1. Check-in e rejeitado -- `on_checkin_rejected_revert_points` reverte pontos, recomputa streak, seta `points_reverted_at`
2. Usuario retenta (photo retry via `retry_rejected_checkin` RPC) -- status volta para `pending`, **mas `points_reverted_at` NAO e limpo**
3. O check-in pendente agora conta como "nao-rejeitado" para calculo de streak
4. Quando o admin re-rejeita, o trigger `on_checkin_rejected_revert_points` encontra `points_reverted_at IS NOT NULL` e **retorna imediatamente** (early exit)
5. Resultado: **sem reversal de pontos** (correto, ja foram revertidos), **sem recompute de streak** (BUG), **sem audit** (BUG)

Arquivo com o bug: [supabase/migrations/20260411100800_desafio_filter_tipo_treino.sql](supabase/migrations/20260411100800_desafio_filter_tipo_treino.sql), funcao `on_checkin_rejected_revert_points`, linhas 62-64:

```sql
if new.points_reverted_at is not null then
    return new;  -- pula TUDO, incluindo streak recompute
end if;
```

## Plano de Correcao

### Fase 1: Migration SQL

Criar uma nova migration `supabase/migrations/20260412130000_fix_streak_re_rejection.sql` com:

**1a. Corrigir `on_checkin_rejected_revert_points`:**
- Quando `points_reverted_at IS NOT NULL` (re-rejeicao), em vez de `RETURN NEW` imediatamente, pular a logica de reversao de pontos mas **ainda chamar `recompute_profile_streak`** e **registrar audit**

A logica corrigida sera:
```sql
if new.points_reverted_at is not null then
    -- Re-rejeicao: pontos ja revertidos, mas streak precisa recalcular
    perform public.recompute_profile_streak(new.user_id);
    
    -- Registrar audit de re-rejeicao
    select p.streak, p.last_checkin_date
    into v_streak_after, v_last_after
    from public.profiles p where p.id = new.user_id;
    
    insert into checkin_moderation_audit (...) values (
      ..., 'rejected_re_rejection', ..., 0, ...
    );
    return new;
end if;
```

**1b. Adicionar recompute de streak no `retry_rejected_checkin`:**
- Apos mudar status para `pending`, chamar `recompute_profile_streak` para refletir que o check-in agora conta como nao-rejeitado

**1c. Backfill de streaks incorretos:**
- Executar `recompute_profile_streak` para todos os usuarios ativos para corrigir valores stale

### Fase 2: Aplicar no Supabase

- Executar `supabase db push` para aplicar a migration
