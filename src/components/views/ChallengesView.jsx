import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy, ChevronDown, ChevronUp, Calendar, Dumbbell, Users, DollarSign } from 'lucide-react';
import { UserAvatar } from '../ui/user-avatar.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { todayLocalISODate } from '../../lib/dates.js';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';
import { logger } from '../../lib/logger.js';

function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function daysRemaining(dataFim) {
  if (!dataFim) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dataFim + 'T23:59:59');
  const diff = Math.ceil((end - today) / 86_400_000);
  return diff;
}

function durationLabel(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return null;
  const start = new Date(dataInicio + 'T00:00:00');
  const end = new Date(dataFim + 'T00:00:00');
  const days = Math.round((end - start) / 86_400_000) + 1;
  return days === 1 ? '1 dia' : `${days} dias`;
}

export function ChallengesView() {
  const { supabase, session, profile, refreshProfile } = useAuth();
  const [desafios, setDesafios] = useState([]);
  const [enrolledIds, setEnrolledIds] = useState(new Set());
  const [participantCounts, setParticipantCounts] = useState({});
  const [rankings, setRankings] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const tenantId = profile?.tenant_id;
  const userId = session?.user?.id;
  const today = useMemo(() => todayLocalISODate(), []);

  const loadDesafios = useCallback(async () => {
    if (!supabase || !tenantId) {
      setDesafios([]);
      setEnrolledIds(new Set());
      setParticipantCounts({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const { data: rows, error: dErr } = await supabase
        .from('desafios')
        .select('id, nome, descricao, status, tipo_treino, data_inicio, data_fim, max_participantes, mes_referencia, reward_winners_count, reward_distribution_type, entry_fee')
        .eq('tenant_id', tenantId)
        .eq('status', 'ativo')
        .order('data_inicio', { ascending: false });

      if (dErr) throw dErr;
      const list = rows || [];
      setDesafios(list);

      if (list.length === 0) {
        setEnrolledIds(new Set());
        setParticipantCounts({});
        setLoading(false);
        return;
      }

      const ids = list.map((r) => r.id);

      const { data: myParts } = await supabase
        .from('desafio_participantes')
        .select('desafio_id')
        .eq('user_id', userId)
        .in('desafio_id', ids);

      setEnrolledIds(new Set((myParts || []).map((p) => p.desafio_id)));

      const counts = {};
      for (const id of ids) {
        const { count } = await supabase
          .from('desafio_participantes')
          .select('id', { count: 'exact', head: true })
          .eq('desafio_id', id);
        counts[id] = count ?? 0;
      }
      setParticipantCounts(counts);
    } catch (e) {
      logger.error('desafios', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantId, userId]);

  useEffect(() => {
    loadDesafios();
  }, [loadDesafios]);

  const loadRanking = useCallback(
    async (desafioId) => {
      if (!supabase) return;
      const { data, error: rErr } = await supabase.rpc('get_desafio_ranking', {
        p_desafio_id: desafioId
      });
      if (rErr) {
        logger.error('ranking desafios', rErr);
        setRankings((prev) => ({ ...prev, [desafioId]: [] }));
      } else {
        setRankings((prev) => ({ ...prev, [desafioId]: Array.isArray(data) ? data : [] }));
      }
    },
    [supabase]
  );

  const toggleExpand = useCallback(
    async (desafioId) => {
      if (expandedId === desafioId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(desafioId);
      if (!rankings[desafioId]) {
        await loadRanking(desafioId);
      }
    },
    [expandedId, rankings, loadRanking]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('challenge_checkout') === 'success') {
      const did = params.get('desafio_id');
      if (did) {
        setEnrolledIds((prev) => new Set([...prev, did]));
      }
      const url = new URL(window.location.href);
      url.searchParams.delete('challenge_checkout');
      url.searchParams.delete('desafio_id');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
      loadDesafios();
    }
  }, []);

  const handleParticipar = async (desafioId) => {
    if (!supabase || !tenantId || !userId || busyId) return;
    setBusyId(desafioId);
    setError(null);
    try {
      const { data, error: fnError } = await invokeEdge('challenge-enroll', supabase, {
        method: 'POST',
        body: { desafio_id: desafioId }
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      if (data?.enrolled) {
        setEnrolledIds((prev) => new Set([...prev, desafioId]));
        if (!data.already) {
          setParticipantCounts((prev) => ({ ...prev, [desafioId]: (prev[desafioId] ?? 0) + 1 }));
        }
        await loadRanking(desafioId);
        if (!expandedId) setExpandedId(desafioId);
        if (refreshProfile) await refreshProfile();
      }
    } catch (e) {
      setError(e.message ?? 'Erro ao participar');
    } finally {
      setBusyId(null);
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
        <p className="text-zinc-500 text-sm">
          Competições do seu grupo — inscreva-se e suba no ranking!
        </p>
      </div>

      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-zinc-500 text-sm">Carregando…</p>
      ) : desafios.length === 0 ? (
        <Card className="border-zinc-800 text-zinc-500 text-sm py-8 text-center">
          Nenhum desafio ativo no momento.
        </Card>
      ) : (
        <div className="space-y-4">
          {desafios.map((d) => {
            const isEnrolled = enrolledIds.has(d.id);
            const isExpanded = expandedId === d.id;
            const ranking = rankings[d.id] || [];
            const count = participantCounts[d.id] ?? 0;
            const remaining = daysRemaining(d.data_fim);
            const duration = durationLabel(d.data_inicio, d.data_fim);
            const isFull = d.max_participantes && count >= d.max_participantes;
            const tipos = Array.isArray(d.tipo_treino) ? d.tipo_treino : [];

            return (
              <Card
                key={d.id}
                className={`group relative overflow-hidden transition-colors ${
                  isEnrolled
                    ? 'border-green-500/30 bg-zinc-900/60'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        {remaining !== null && remaining >= 0 && (
                          <span className="bg-green-500/10 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                            {remaining === 0
                              ? 'Último dia'
                              : remaining === 1
                                ? '1 dia restante'
                                : `${remaining} dias restantes`}
                          </span>
                        )}
                        {remaining !== null && remaining < 0 && (
                          <span className="bg-zinc-800 text-zinc-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                            Encerrado
                          </span>
                        )}
                        {duration && (
                          <span className="text-zinc-600 text-[10px] font-medium uppercase">
                            {duration}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold leading-tight">{d.nome}</h3>
                      {d.descricao && (
                        <p className="text-zinc-500 text-xs mt-1 line-clamp-2">{d.descricao}</p>
                      )}
                    </div>
                    <div className="bg-yellow-500/10 p-2 rounded-xl border border-yellow-500/20 shrink-0">
                      <Trophy size={22} className="text-yellow-500" />
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {formatDateBR(d.data_inicio)} — {formatDateBR(d.data_fim)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {count} participante{count !== 1 ? 's' : ''}
                      {d.max_participantes ? ` / ${d.max_participantes}` : ''}
                    </span>
                  </div>

                  {/* Workout types */}
                  {tipos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tipos.map((t) => (
                        <span
                          key={t}
                          className="flex items-center gap-1 bg-zinc-800 text-zinc-400 text-[10px] font-medium px-2 py-0.5 rounded-full"
                        >
                          <Dumbbell size={10} />
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Reward info */}
                  <div className="flex items-center gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3 py-2">
                    <Trophy size={14} className="text-yellow-500 shrink-0" />
                    <span className="text-xs text-yellow-200/80">
                      <span className="font-bold text-yellow-400">Top {d.reward_winners_count ?? 3}</span>
                      {' dividem o prêmio '}
                      <span className="text-yellow-500/70">
                        ({d.reward_distribution_type === 'weighted' ? 'Proporcional ao Ranking' : 'Divisão Igual'})
                      </span>
                    </span>
                  </div>

                  {/* Entry fee info */}
                  {d.entry_fee > 0 && !isEnrolled && (
                    <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/20 rounded-xl px-3 py-2">
                      <DollarSign size={14} className="text-green-500 shrink-0" />
                      <span className="text-xs text-green-200/80">
                        Taxa de inscrição:{' '}
                        <span className="font-bold text-green-400">
                          R$ {(d.entry_fee / 100).toFixed(2).replace('.', ',')}
                        </span>
                      </span>
                    </div>
                  )}

                  {/* Enrollment action */}
                  {!isEnrolled ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!!busyId || !!isFull}
                      onClick={() => handleParticipar(d.id)}
                      className="w-full py-2.5 text-sm"
                    >
                      {busyId === d.id
                        ? 'Processando…'
                        : isFull
                          ? 'Vagas esgotadas'
                          : d.entry_fee > 0
                            ? `Inscrever-se — R$ ${(d.entry_fee / 100).toFixed(2).replace('.', ',')}`
                            : 'Participar do desafio'}
                    </Button>
                  ) : (
                    <p className="text-green-400 text-sm font-bold">
                      Você está inscrito — seus check-ins somam pontos aqui.
                    </p>
                  )}

                  {/* Expand/collapse ranking */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(d.id)}
                    className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-xs font-medium transition-colors w-full justify-center pt-1"
                  >
                    {isExpanded ? (
                      <>
                        Esconder ranking <ChevronUp size={14} />
                      </>
                    ) : (
                      <>
                        Ver ranking <ChevronDown size={14} />
                      </>
                    )}
                  </button>

                  {/* Ranking list */}
                  {isExpanded && (
                    <div className="border-t border-zinc-800 pt-3 space-y-2">
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wide">
                        Ranking do desafio
                      </h4>
                      {ranking.length === 0 ? (
                        <p className="text-zinc-600 text-xs">Ainda sem participantes no ranking.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {ranking.map((row, idx) => (
                            <li
                              key={row.user_id}
                              className={`flex items-center justify-between p-2.5 rounded-xl border ${
                                row.is_me
                                  ? 'border-green-500/40 bg-zinc-800/50'
                                  : 'border-zinc-800 bg-zinc-900/40'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-zinc-600 font-black w-5 text-xs shrink-0">
                                  #{idx + 1}
                                </span>
                                <UserAvatar src={row.avatar_url} size="sm" className="w-7 h-7 bg-zinc-800 border border-zinc-700" />
                                <span
                                  className={`font-bold text-sm truncate ${row.is_me ? 'text-green-400' : 'text-white'}`}
                                >
                                  {row.nome_exibicao}
                                  {row.is_me && (
                                    <span className="text-zinc-500 font-normal text-[10px] ml-1">
                                      (você)
                                    </span>
                                  )}
                                </span>
                              </div>
                              <span className="text-green-400 font-black text-sm shrink-0">
                                {row.pontos_desafio} pts
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

    </div>
  );
}
