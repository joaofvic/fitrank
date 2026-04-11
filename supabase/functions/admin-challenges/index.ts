import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'npm:zod@3.24.2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
};

async function insertPlatformAudit(
  admin: ReturnType<typeof createClient>,
  row: {
    actor_id: string;
    action: string;
    target_type: string;
    target_id: string | null;
    tenant_id: string | null;
    payload: Record<string, unknown>;
  }
) {
  const { error } = await admin.from('platform_admin_audit_log').insert({
    actor_id: row.actor_id,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    tenant_id: row.tenant_id,
    payload: row.payload
  });
  if (error) console.error('platform_admin_audit_log', error);
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const listQuerySchema = z.object({
  mode: z.literal('list').default('list'),
  tenant_id: z.string().uuid().optional(),
  status: z.enum(['rascunho', 'ativo', 'encerrado', 'cancelado']).optional(),
  from: z.string().regex(dateRegex).optional(),
  to: z.string().regex(dateRegex).optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
});

const detailQuerySchema = z.object({
  mode: z.literal('detail'),
  id: z.string().uuid()
});

const participantsQuerySchema = z.object({
  mode: z.literal('participants'),
  id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
});

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  nome: z.string().min(1).max(200),
  descricao: z.string().max(2000).default(''),
  tipo_treino: z.array(z.string().min(1).max(100)).default([]),
  data_inicio: z.string().regex(dateRegex),
  data_fim: z.string().regex(dateRegex),
  max_participantes: z.number().int().min(1).nullable().default(null),
  reward_winners_count: z.number().int().min(1).max(50).default(3),
  reward_distribution_type: z.enum(['equal', 'weighted']).default('equal'),
  status: z.enum(['rascunho', 'ativo']).default('rascunho')
});

const updateSchema = z.object({
  action: z.literal('update'),
  id: z.string().uuid(),
  nome: z.string().min(1).max(200).optional(),
  descricao: z.string().max(2000).optional(),
  tipo_treino: z.array(z.string().min(1).max(100)).optional(),
  data_inicio: z.string().regex(dateRegex).optional(),
  data_fim: z.string().regex(dateRegex).optional(),
  max_participantes: z.number().int().min(1).nullable().optional(),
  reward_winners_count: z.number().int().min(1).max(50).optional(),
  reward_distribution_type: z.enum(['equal', 'weighted']).optional()
});

const lifecycleSchema = z.object({
  action: z.enum(['activate', 'close', 'cancel']),
  id: z.string().uuid(),
  motivo: z.string().max(500).optional()
});

const removeParticipantSchema = z.object({
  action: z.literal('remove_participant'),
  desafio_id: z.string().uuid(),
  user_id: z.string().uuid(),
  motivo: z.string().min(1).max(500)
});

function validateDateRange(inicio: string, fim: string): string | null {
  if (fim < inicio) return 'data_fim deve ser >= data_inicio';
  return null;
}

async function fetchCatalog(
  userClient: ReturnType<typeof createClient>
): Promise<string[]> {
  const { data, error } = await userClient.rpc('admin_tipo_treino_catalog');
  if (error || !Array.isArray(data)) return [];
  return data as string[];
}

function validateTipoTreino(tipos: string[], catalog: string[]): string | null {
  if (tipos.length === 0) return null;
  const catalogSet = new Set(catalog);
  const invalid = tipos.filter((t) => !catalogSet.has(t));
  if (invalid.length > 0) {
    return 'Tipo(s) de treino invalido(s): ' + invalid.join(', ');
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: 'Configuracao do servidor incompleta' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Nao autorizado' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: 'Sessao invalida' }, 401);
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('is_platform_master')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile?.is_platform_master) {
    return jsonResponse({ error: 'Acesso negado' }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const url = new URL(req.url);

  try {
    if (req.method === 'GET') {
      const params = Object.fromEntries(url.searchParams.entries());
      const mode = params.mode ?? 'list';

      if (mode === 'detail') {
        const parsed = detailQuerySchema.safeParse(params);
        if (!parsed.success) {
          return jsonResponse({ error: 'Query invalida', details: parsed.error.flatten() }, 400);
        }
        const { data, error } = await userClient.rpc('admin_desafio_detail', {
          p_desafio_id: parsed.data.id
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] ?? null : data;
        if (!row) return jsonResponse({ error: 'Desafio nao encontrado' }, 404);
        return jsonResponse({ desafio: row }, 200);
      }

      if (mode === 'participants') {
        const parsed = participantsQuerySchema.safeParse(params);
        if (!parsed.success) {
          return jsonResponse({ error: 'Query invalida', details: parsed.error.flatten() }, 400);
        }
        const { data, error } = await userClient.rpc('admin_desafio_participantes', {
          p_desafio_id: parsed.data.id,
          p_limit: parsed.data.limit,
          p_offset: parsed.data.offset
        });
        if (error) throw error;
        return jsonResponse({ participants: data ?? [] }, 200);
      }

      const parsed = listQuerySchema.safeParse(params);
      if (!parsed.success) {
        return jsonResponse({ error: 'Query invalida', details: parsed.error.flatten() }, 400);
      }
      const { data, error } = await userClient.rpc('admin_desafios_list', {
        p_tenant_id: parsed.data.tenant_id ?? null,
        p_status: parsed.data.status ?? null,
        p_from: parsed.data.from ?? null,
        p_to: parsed.data.to ?? null,
        p_search: parsed.data.search ?? null,
        p_limit: parsed.data.limit,
        p_offset: parsed.data.offset
      });
      if (error) throw error;
      return jsonResponse({ desafios: data ?? [] }, 200);
    }

    if (req.method === 'POST') {
      const raw = await req.json().catch(() => null);
      const parsed = createSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonResponse({ error: 'Payload invalido', details: parsed.error.flatten() }, 400);
      }

      const d = parsed.data;

      const dateErr = validateDateRange(d.data_inicio, d.data_fim);
      if (dateErr) return jsonResponse({ error: dateErr }, 400);

      const { data: tenantRow, error: tenantErr } = await admin
        .from('tenants')
        .select('id')
        .eq('id', d.tenant_id)
        .maybeSingle();
      if (tenantErr) throw tenantErr;
      if (!tenantRow) return jsonResponse({ error: 'Tenant nao encontrado' }, 400);

      if (d.tipo_treino.length > 0) {
        const catalog = await fetchCatalog(userClient);
        const tipoErr = validateTipoTreino(d.tipo_treino, catalog);
        if (tipoErr) return jsonResponse({ error: tipoErr }, 400);
      }

      const { data: created, error: insertErr } = await admin
        .from('desafios')
        .insert({
          tenant_id: d.tenant_id,
          nome: d.nome,
          descricao: d.descricao,
          tipo_treino: d.tipo_treino,
          data_inicio: d.data_inicio,
          data_fim: d.data_fim,
          mes_referencia: d.data_inicio,
          ativo: d.status === 'ativo',
          status: d.status,
          criado_por: user.id,
          max_participantes: d.max_participantes,
          reward_winners_count: d.reward_winners_count,
          reward_distribution_type: d.reward_distribution_type
        })
        .select('*')
        .single();

      if (insertErr) throw insertErr;

      await insertPlatformAudit(admin, {
        actor_id: user.id,
        action: 'desafio.create',
        target_type: 'desafio',
        target_id: created.id,
        tenant_id: d.tenant_id,
        payload: {
          nome: d.nome,
          status: d.status,
          data_inicio: d.data_inicio,
          data_fim: d.data_fim,
          tipo_treino: d.tipo_treino
        }
      });

      return jsonResponse({ desafio: created }, 201);
    }

    if (req.method === 'PATCH') {
      const raw = await req.json().catch(() => null);
      if (!raw || typeof raw !== 'object' || !raw.action) {
        return jsonResponse({ error: 'Campo action obrigatorio no payload' }, 400);
      }

      if (raw.action === 'remove_participant') {
        const parsed = removeParticipantSchema.safeParse(raw);
        if (!parsed.success) {
          return jsonResponse({ error: 'Payload invalido', details: parsed.error.flatten() }, 400);
        }
        const rp = parsed.data;

        const { data: participant, error: pErr } = await admin
          .from('desafio_participantes')
          .select('id, desafio_id, user_id, tenant_id, pontos_desafio')
          .eq('desafio_id', rp.desafio_id)
          .eq('user_id', rp.user_id)
          .maybeSingle();

        if (pErr) throw pErr;
        if (!participant) {
          return jsonResponse({ error: 'Participante nao encontrado' }, 404);
        }

        const { error: delErr } = await admin
          .from('desafio_participantes')
          .delete()
          .eq('id', participant.id);

        if (delErr) throw delErr;

        await insertPlatformAudit(admin, {
          actor_id: user.id,
          action: 'desafio.remove_participant',
          target_type: 'desafio',
          target_id: rp.desafio_id,
          tenant_id: participant.tenant_id,
          payload: {
            user_id: rp.user_id,
            motivo: rp.motivo,
            pontos_desafio: participant.pontos_desafio
          }
        });

        return jsonResponse({ ok: true }, 200);
      }

      if (raw.action === 'activate' || raw.action === 'close' || raw.action === 'cancel') {
        const parsed = lifecycleSchema.safeParse(raw);
        if (!parsed.success) {
          return jsonResponse({ error: 'Payload invalido', details: parsed.error.flatten() }, 400);
        }
        const lc = parsed.data;

        const { data: existing, error: fetchErr } = await admin
          .from('desafios')
          .select('id, status, data_inicio, data_fim, tenant_id, nome')
          .eq('id', lc.id)
          .maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!existing) return jsonResponse({ error: 'Desafio nao encontrado' }, 404);

        const transitions: Record<string, { from: string[]; to: string }> = {
          activate: { from: ['rascunho'], to: 'ativo' },
          close: { from: ['ativo'], to: 'encerrado' },
          cancel: { from: ['rascunho', 'ativo', 'encerrado'], to: 'cancelado' }
        };

        const rule = transitions[lc.action];
        if (!rule.from.includes(existing.status)) {
          return jsonResponse(
            { error: 'Transicao invalida: ' + existing.status + ' -> ' + rule.to },
            400
          );
        }

        if (lc.action === 'activate') {
          if (!existing.data_inicio || !existing.data_fim) {
            return jsonResponse(
              { error: 'Datas de inicio e fim obrigatorias para ativar' },
              400
            );
          }
        }

        const { data: updated, error: updErr } = await admin
          .from('desafios')
          .update({ status: rule.to })
          .eq('id', lc.id)
          .select('*')
          .single();

        if (updErr) throw updErr;

        await insertPlatformAudit(admin, {
          actor_id: user.id,
          action: 'desafio.' + lc.action,
          target_type: 'desafio',
          target_id: lc.id,
          tenant_id: existing.tenant_id,
          payload: {
            nome: existing.nome,
            from_status: existing.status,
            to_status: rule.to,
            motivo: lc.motivo ?? null
          }
        });

        return jsonResponse({ desafio: updated }, 200);
      }

      if (raw.action === 'update') {
        const parsed = updateSchema.safeParse(raw);
        if (!parsed.success) {
          return jsonResponse({ error: 'Payload invalido', details: parsed.error.flatten() }, 400);
        }
        const upd = parsed.data;

        const { data: existing, error: fetchErr } = await admin
          .from('desafios')
          .select('id, status, tenant_id, nome, data_inicio, data_fim')
          .eq('id', upd.id)
          .maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!existing) return jsonResponse({ error: 'Desafio nao encontrado' }, 404);

        if (existing.status === 'cancelado') {
          return jsonResponse({ error: 'Desafio cancelado nao pode ser editado' }, 400);
        }
        if (existing.status === 'encerrado') {
          return jsonResponse({ error: 'Desafio encerrado nao pode ser editado' }, 400);
        }

        if (existing.status === 'ativo') {
          const { count } = await admin
            .from('desafio_participantes')
            .select('id', { count: 'exact', head: true })
            .eq('desafio_id', upd.id);

          if ((count ?? 0) > 0 && (upd.data_inicio || upd.data_fim)) {
            return jsonResponse(
              { error: 'Nao e possivel alterar datas de desafio ativo com participantes' },
              400
            );
          }
        }

        const fields: Record<string, unknown> = {};
        if (upd.nome !== undefined) fields.nome = upd.nome;
        if (upd.descricao !== undefined) fields.descricao = upd.descricao;
        if (upd.tipo_treino !== undefined) fields.tipo_treino = upd.tipo_treino;
        if (upd.data_inicio !== undefined) {
          fields.data_inicio = upd.data_inicio;
          fields.mes_referencia = upd.data_inicio;
        }
        if (upd.data_fim !== undefined) fields.data_fim = upd.data_fim;
        if (upd.max_participantes !== undefined) fields.max_participantes = upd.max_participantes;
        if (upd.reward_winners_count !== undefined) fields.reward_winners_count = upd.reward_winners_count;
        if (upd.reward_distribution_type !== undefined) fields.reward_distribution_type = upd.reward_distribution_type;

        if (Object.keys(fields).length === 0) {
          return jsonResponse({ error: 'Nenhum campo para atualizar' }, 400);
        }

        const finalInicio = (fields.data_inicio as string) ?? existing.data_inicio;
        const finalFim = (fields.data_fim as string) ?? existing.data_fim;
        if (finalInicio && finalFim) {
          const dateErr = validateDateRange(finalInicio, finalFim);
          if (dateErr) return jsonResponse({ error: dateErr }, 400);
        }

        if (upd.tipo_treino && upd.tipo_treino.length > 0) {
          const catalog = await fetchCatalog(userClient);
          const tipoErr = validateTipoTreino(upd.tipo_treino, catalog);
          if (tipoErr) return jsonResponse({ error: tipoErr }, 400);
        }

        const { data: updated, error: updErr } = await admin
          .from('desafios')
          .update(fields)
          .eq('id', upd.id)
          .select('*')
          .single();

        if (updErr) throw updErr;

        await insertPlatformAudit(admin, {
          actor_id: user.id,
          action: 'desafio.update',
          target_type: 'desafio',
          target_id: upd.id,
          tenant_id: existing.tenant_id,
          payload: { fields_changed: Object.keys(fields) }
        });

        return jsonResponse({ desafio: updated }, 200);
      }

      return jsonResponse({ error: 'Acao desconhecida: ' + raw.action }, 400);
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id || !z.string().uuid().safeParse(id).success) {
        return jsonResponse({ error: 'Parametro id (uuid) obrigatorio' }, 400);
      }

      const { data: existing, error: fetchErr } = await admin
        .from('desafios')
        .select('id, status, tenant_id, nome')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!existing) return jsonResponse({ error: 'Desafio nao encontrado' }, 404);

      if (existing.status === 'cancelado') {
        return jsonResponse({ error: 'Desafio ja esta cancelado' }, 400);
      }

      const { data: updated, error: updErr } = await admin
        .from('desafios')
        .update({ status: 'cancelado' })
        .eq('id', id)
        .select('*')
        .single();

      if (updErr) throw updErr;

      await insertPlatformAudit(admin, {
        actor_id: user.id,
        action: 'desafio.cancel',
        target_type: 'desafio',
        target_id: id,
        tenant_id: existing.tenant_id,
        payload: {
          nome: existing.nome,
          from_status: existing.status,
          via: 'DELETE'
        }
      });

      return jsonResponse({ desafio: updated }, 200);
    }

    return jsonResponse({ error: 'Metodo nao permitido' }, 405);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    console.error('admin-challenges:', message);
    return jsonResponse({ error: message }, 500);
  }
});
