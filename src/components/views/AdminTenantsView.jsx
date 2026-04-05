import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';

export function AdminTenantsView({ onBack }) {
  const { supabase, profile } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const load = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    setLoading(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke('admin-tenants', { method: 'GET' });
    if (fnError) {
      setError(fnError.message);
      setTenants([]);
    } else if (data?.error) {
      setError(data.error);
      setTenants([]);
    } else {
      setTenants(data?.tenants ?? []);
    }
    setLoading(false);
  }, [supabase, profile?.is_platform_master]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (tenantId, status) => {
    setUpdatingId(tenantId);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke('admin-tenants', {
      method: 'PATCH',
      body: { tenant_id: tenantId, status }
    });
    setUpdatingId(null);
    if (fnError) {
      setError(fnError.message);
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }
    await load();
  };

  if (!profile?.is_platform_master) {
    return null;
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-black uppercase tracking-tight text-white">Admin · Tenants</h2>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-zinc-500 hover:text-green-400"
        >
          Voltar
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-zinc-500 text-sm">Carregando…</p>
      ) : (
        <ul className="space-y-3">
          {tenants.map((t) => (
            <li
              key={t.id}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2"
            >
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="font-bold text-white">{t.name}</p>
                  <p className="text-xs text-zinc-500 font-mono">{t.slug}</p>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                    t.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {t.status}
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {t.status === 'active' ? (
                  <Button
                    type="button"
                    disabled={updatingId === t.id}
                    onClick={() => setStatus(t.id, 'suspended')}
                    className="text-xs py-2 px-3 bg-zinc-800 text-zinc-300"
                  >
                    Suspender
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={updatingId === t.id}
                    onClick={() => setStatus(t.id, 'active')}
                    className="text-xs py-2 px-3"
                  >
                    Ativar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
