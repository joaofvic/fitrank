import { useCallback, useEffect, useState } from 'react';
import { Trophy, User, Info } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { firstOfMonthLocalISODate } from '../../lib/dates.js';

export function ChallengesView() {
  const { supabase, session, profile, refreshProfile } = useAuth();
  const [desafio, setDesafio] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const tenantId = profile?.tenant_id;
  const userId = session?.user?.id;
  const monthStart = firstOfMonthLocalISODate();

  const loadDesafioAndRanking = useCallback(async () => {
    if (!supabase || !tenantId) {
      setDesafio(null);
      setRanking([]);
      setEnrolled(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data: dRow, error: dErr } = await supabase
      .from('desafios')
      .select('id, nome, ativo, mes_referencia')
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .eq('mes_referencia', monthStart)
      .maybeSingle();

    if (dErr) {
      console.error('FitRank: desafio', dErr.message);
      setError(dErr.message);
      setDesafio(null);
      setRanking([]);
      setLoading(false);
      return;
    }

    setDesafio(dRow);

    if (!dRow?.id) {
      setRanking([]);
      setEnrolled(false);
      setLoading(false);
      return;
    }

    const { data: part, error: pErr } = await supabase
      .from('desafio_participantes')
      .select('id')
      .eq('desafio_id', dRow.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!pErr && part) setEnrolled(true);
    else setEnrolled(false);

    const { data: rankData, error: rErr } = await supabase.rpc('get_desafio_ranking', {
      p_desafio_id: dRow.id
    });

    if (rErr) {
      console.error('FitRank: ranking desafio', rErr.message);
      setRanking([]);
    } else {
      setRanking(Array.isArray(rankData) ? rankData : []);
    }

    setLoading(false);
  }, [supabase, tenantId, userId, monthStart]);

  useEffect(() => {
    loadDesafioAndRanking();
  }, [loadDesafioAndRanking]);

  const handleParticipar = async () => {
    if (!supabase || !desafio?.id || !tenantId || !userId) return;
    setBusy(true);
    setError(null);
    try {
      const { error: insErr } = await supabase.from('desafio_participantes').insert({
        desafio_id: desafio.id,
        user_id: userId,
        tenant_id: tenantId
      });
      if (insErr) {
        if (insErr.code === '23505') {
          setEnrolled(true);
        } else {
          throw insErr;
        }
      } else {
        setEnrolled(true);
      }
      await loadDesafioAndRanking();
      if (refreshProfile) await refreshProfile();
    } catch (e) {
      setError(e.message ?? 'Não foi possível participar');
    } finally {
      setBusy(false);
    }
  };

  if (!tenantId) {
    return (
      <div className="text-center py-16 text-zinc-500 text-sm animate-in-fade">
        Carregando desafios…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in-fade">
      <div className="space-y-1">
        <h2 className="text-2xl font-black">Desafios</h2>
        <p className="text-zinc-500">Competição mensal do seu tenant — ranking próprio.</p>
      </div>

      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-zinc-500 text-sm">Carregando…</p>
      ) : !desafio ? (
        <Card className="border-zinc-800 text-zinc-500 text-sm py-8 text-center">
          Nenhum desafio ativo para este mês. Um admin pode criar em <code className="text-zinc-400">desafios</code>{' '}
          (mes_referencia = primeiro dia do mês).
        </Card>
      ) : (
        <Card className="group relative overflow-hidden border-green-500/20">
          <div className="space-y-4">
            <div className="flex justify-between items-start gap-2">
              <div>
                <div className="bg-zinc-800 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase mb-2 inline-block">
                  Mensal
                </div>
                <h3 className="text-xl font-bold">{desafio.nome}</h3>
                <p className="text-zinc-500 text-sm mt-1">
                  Mês referência:{' '}
                  {new Date(desafio.mes_referencia + 'T12:00:00').toLocaleDateString('pt-BR', {
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>
              <div className="bg-yellow-500/10 p-2 rounded-xl border border-yellow-500/20 shrink-0">
                <Trophy size={24} className="text-yellow-500" />
              </div>
            </div>

            {!enrolled ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={handleParticipar}
                className="w-full py-3"
              >
                {busy ? 'Inscrevendo…' : 'Participar do desafio'}
              </Button>
            ) : (
              <p className="text-green-400 text-sm font-bold">Você está inscrito. Pontos do check-in somam aqui.</p>
            )}

            <div className="border-t border-zinc-800 pt-4 space-y-2">
              <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wide">Ranking do desafio</h4>
              {ranking.length === 0 ? (
                <p className="text-zinc-600 text-sm">Ainda sem participantes no ranking.</p>
              ) : (
                <ul className="space-y-2">
                  {ranking.map((row, idx) => (
                    <li
                      key={row.user_id}
                      className={`flex items-center justify-between p-3 rounded-xl border ${
                        row.is_me ? 'border-green-500/40 bg-zinc-800/50' : 'border-zinc-800 bg-zinc-900/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-zinc-600 font-black w-6 shrink-0">#{idx + 1}</span>
                        <User className="w-4 h-4 text-zinc-500 shrink-0" />
                        <span className={`font-bold truncate ${row.is_me ? 'text-green-400' : 'text-white'}`}>
                          {row.nome_exibicao}
                          {row.is_me && (
                            <span className="text-zinc-500 font-normal text-xs ml-1">(você)</span>
                          )}
                        </span>
                      </div>
                      <span className="text-green-400 font-black shrink-0">{row.pontos_desafio} pts</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6 text-center space-y-3">
        <Info className="w-8 h-8 text-orange-500 mx-auto" />
        <h4 className="font-bold text-orange-500">Desafios pagos</h4>
        <p className="text-sm text-zinc-400">
          Torneios com premiação via PIX e outros formatos entram nas próximas fases do produto.
        </p>
      </div>
    </div>
  );
}
