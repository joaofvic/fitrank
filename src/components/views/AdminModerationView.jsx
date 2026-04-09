import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';

const STATUSES = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'rejected', label: 'Rejeitados' }
];

export function AdminModerationView({ onBack }) {
  const { supabase, profile, session } = useAuth();

  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);

  const [status, setStatus] = useState('pending');
  const [tenantId, setTenantId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tipo, setTipo] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const tenantOptions = useMemo(() => {
    return [{ id: '', label: 'Todos os tenants' }].concat(
      (tenants ?? []).map((t) => ({ id: t.id, label: `${t.slug}${t.name ? ` · ${t.name}` : ''}` }))
    );
  }, [tenants]);

  const loadTenants = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    const { data: sData } = await supabase.auth.getSession();
    const token = sData?.session?.access_token ?? session?.access_token ?? null;
    const { data, error: fnError } = await invokeEdge('admin-tenants', token, {
      method: 'GET'
    });
    if (fnError) {
      console.error('FitRank: admin tenants', fnError.message);
      setTenants([]);
      return;
    }
    if (data?.error) {
      console.error('FitRank: admin tenants', data.error);
      setTenants([]);
      return;
    }
    setTenants(data?.tenants ?? []);
  }, [supabase, profile?.is_platform_master, session?.access_token]);

  const loadQueue = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('status', status);
    if (tenantId) params.set('tenant_id', tenantId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (tipo) params.set('tipo', tipo);
    params.set('limit', '30');
    params.set('offset', '0');

    const { data: sData } = await supabase.auth.getSession();
    const token = sData?.session?.access_token ?? session?.access_token ?? null;
    const { data, error: fnError } = await invokeEdge(
      `admin-moderation?${params.toString()}`,
      token,
      { method: 'GET' }
    );

    if (fnError) {
      setError(fnError.message);
      setItems([]);
      setLoading(false);
      return;
    }
    if (data?.error) {
      setError(data.error);
      setItems([]);
      setLoading(false);
      return;
    }

    setItems(Array.isArray(data?.items) ? data.items : []);
    setLoading(false);
  }, [supabase, profile?.is_platform_master, status, tenantId, from, to, tipo, session?.access_token]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  if (!profile?.is_platform_master) {
    return null;
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-xl font-black uppercase tracking-tight text-white">Admin · Moderação</h2>
          <p className="text-xs text-zinc-500">Fila global de fotos (cross-tenant)</p>
        </div>
        <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-green-400">
          Voltar
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-3 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <Button
              key={s.id}
              type="button"
              onClick={() => setStatus(s.id)}
              className={`text-xs py-2 px-3 ${
                status === s.id ? '' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Tenant</span>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            >
              {tenantOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Tipo de treino</span>
            <input
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              placeholder="Ex: Superior"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500">De</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Até</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">{loading ? 'Carregando…' : `${items.length} itens`}</p>
          <Button type="button" onClick={loadQueue} className="text-xs py-2 px-3">
            Atualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Carregando fila…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-zinc-600 border border-dashed border-zinc-800 rounded-2xl">
          Nenhum item encontrado.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const nome =
              it?.profiles?.display_name?.trim() ||
              it?.profiles?.nome?.trim() ||
              'Atleta';
            const tenantLabel = it?.tenants?.slug || it.tenant_id;
            return (
              <li key={it.id} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{nome}</p>
                    <p className="text-xs text-zinc-500 font-mono truncate">{tenantLabel}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {it.tipo_treino} · {it.checkin_local_date} · +{it.points_awarded} pts
                    </p>
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400">
                    {it.photo_review_status}
                  </span>
                </div>

                {it.foto_url ? (
                  <a
                    href={it.foto_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-xl border border-zinc-800"
                  >
                    <img src={it.foto_url} alt="" className="w-full h-52 object-cover" loading="lazy" />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

