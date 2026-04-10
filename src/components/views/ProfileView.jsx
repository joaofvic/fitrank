import { useCallback, useEffect, useState } from 'react';
import { User, Camera, Flame, Zap, Calendar, CheckCircle2, Crown } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';

export function ProfileView({
  userData,
  checkins,
  notifications = [],
  onMarkNotificationRead,
  cloudTenant = null,
  cloudDisplayName = null,
  isPlatformMaster = false,
  onOpenAdmin,
  onOpenChallenges,
  onOpenModeration,
  onOpenModerationSettings,
  onOpenUsers,
  onOpenEngagement,
  onOpenAudit,
  onSignOut
}) {
  const { supabase } = useAuth();
  const [reasonLabelMap, setReasonLabelMap] = useState({});

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('photo_rejection_reasons')
        .select('code, label')
        .eq('is_active', true);
      if (cancelled || error) return;
      const map = {};
      for (const r of data ?? []) {
        if (r.code && r.label) map[r.code] = r.label;
      }
      setReasonLabelMap(map);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const displayNome = cloudDisplayName || userData?.nome;
  const created = userData?.created_at
    ? new Date(userData.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : '—';

  const rejectionReasonLabel = useCallback(
    (code) => {
      const c = (code ?? '').trim();
      if (!c) return null;
      return reasonLabelMap[c] ?? c;
    },
    [reasonLabelMap]
  );

  return (
    <div className="space-y-6 animate-in-fade">
      {Array.isArray(notifications) && notifications.length > 0 ? (
        <Card className="bg-zinc-900/50 border border-zinc-800">
          <h4 className="font-bold mb-3 flex items-center gap-2">
            <span className="text-xs uppercase text-zinc-500 font-black">Notificações</span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-red-500/10 text-red-300 border border-red-900/40">
              {notifications.length} nova(s)
            </span>
          </h4>
          <div className="space-y-3">
            {notifications.map((n) => (
              <div key={n.id} className="rounded-xl border border-zinc-800 bg-black/20 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{n.title}</p>
                    {n.body ? <p className="text-xs text-zinc-400 mt-1">{n.body}</p> : null}
                  </div>
                  {onMarkNotificationRead ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-[10px] px-2 py-1 h-auto"
                      onClick={() => onMarkNotificationRead(n.id)}
                    >
                      Marcar como lida
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="text-center space-y-4">
        <div className="relative inline-block">
          <div className="w-24 h-24 rounded-full bg-zinc-800 border-4 border-zinc-700 flex items-center justify-center mx-auto shadow-2xl shadow-green-500/10">
            <User size={48} className="text-zinc-500" />
          </div>
          <div className="absolute bottom-0 right-0 bg-green-500 p-2 rounded-full border-4 border-black">
            <Camera size={16} className="text-black" />
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-black">{displayNome}</h2>
          <p className="text-zinc-500">Desde {created}</p>
          {cloudTenant && (
            <p className="text-xs text-zinc-600 mt-1">
              Academia: <span className="text-zinc-400 font-mono">{cloudTenant.slug}</span>
              {cloudTenant.name ? ` · ${cloudTenant.name}` : ''}
            </p>
          )}
        </div>
      </div>

      {(isPlatformMaster || onSignOut) && (
        <div className="flex flex-col gap-2">
          {isPlatformMaster && onOpenAdmin && (
            <Button variant="secondary" className="w-full py-2 text-sm" onClick={onOpenAdmin}>
              Admin · Tenants
            </Button>
          )}
          {isPlatformMaster && onOpenChallenges && (
            <Button variant="secondary" className="w-full py-2 text-sm" onClick={onOpenChallenges}>
              Admin · Desafios
            </Button>
          )}
          {isPlatformMaster && onOpenUsers && (
            <Button variant="secondary" className="w-full py-2 text-sm" onClick={onOpenUsers}>
              Admin · Usuários
            </Button>
          )}
          {isPlatformMaster && onOpenModeration && (
            <Button variant="secondary" className="w-full py-2 text-sm" onClick={onOpenModeration}>
              Admin · Moderação
            </Button>
          )}
          {isPlatformMaster && onOpenModerationSettings && (
            <Button variant="secondary" className="w-full py-2 text-sm" onClick={onOpenModerationSettings}>
              Admin · Config moderação
            </Button>
          )}
          {isPlatformMaster && onOpenEngagement && (
            <Button variant="secondary" className="w-full py-2 text-sm" onClick={onOpenEngagement}>
              Admin · Engajamento
            </Button>
          )}
          {isPlatformMaster && onOpenAudit && (
            <Button variant="secondary" className="w-full py-2 text-sm" onClick={onOpenAudit}>
              Admin · Auditoria
            </Button>
          )}
          {onSignOut && (
            <Button variant="ghost" className="w-full py-2 text-sm" onClick={onSignOut}>
              Sair da conta
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col items-center justify-center py-6 border-orange-500/20">
          <Flame className="w-8 h-8 text-orange-500 fill-orange-500 mb-2" />
          <span className="text-2xl font-black">{userData?.streak || 0}</span>
          <span className="text-xs text-zinc-500 uppercase">
            {(userData?.streak || 0) === 1 ? 'Dia Seguido' : 'Dias Seguidos'}
          </span>
        </Card>
        <Card className="flex flex-col items-center justify-center py-6 border-green-500/20">
          <Zap className="w-8 h-8 text-green-500 fill-green-500 mb-2" />
          <span className="text-2xl font-black">{userData?.pontos || 0}</span>
          <span className="text-xs text-zinc-500 uppercase">Total Pontos</span>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="font-bold flex items-center gap-2">
          <Calendar className="w-5 h-5 text-zinc-400" />
          Histórico de Treinos
        </h3>

        {checkins.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-600">
            Você ainda não registrou nenhum treino.
          </div>
        ) : (
          <div className="space-y-3">
            {checkins.map((c) => (
              <div
                key={c.id}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                    {c.foto_url ? (
                      <img src={c.foto_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-white">{c.type}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(c.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </p>
                    {c.photo_review_status === 'rejected' ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-[11px] text-red-300 font-bold">Foto rejeitada</p>
                        {c.photo_rejection_reason_code ? (
                          <p className="text-[11px] text-zinc-400">
                            Motivo:{' '}
                            <span className="text-zinc-200">
                              {rejectionReasonLabel(c.photo_rejection_reason_code)}
                            </span>
                          </p>
                        ) : null}
                        {c.photo_rejection_note ? (
                          <p className="text-[11px] text-zinc-400">
                            Observação: <span className="text-zinc-200">{c.photo_rejection_note}</span>
                          </p>
                        ) : null}
                      </div>
                    ) : c.photo_review_status === 'pending' ? (
                      <p className="text-[11px] text-yellow-300 mt-1">Aguardando revisão da foto</p>
                    ) : null}
                  </div>
                </div>
                <div
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    c.photo_review_status === 'rejected'
                      ? 'bg-zinc-700/30 text-zinc-300 border border-zinc-700/40'
                      : 'bg-green-500/10 text-green-500'
                  }`}
                >
                  +{c.photo_review_status === 'rejected' ? 0 : c.points_earned ?? 0} PTS
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Card className="bg-zinc-800/30 border-dashed border-zinc-700">
        <h4 className="font-bold mb-1 flex items-center gap-2">
          <Crown className="w-4 h-4 text-yellow-500" />
          Seja um Membro PRO
        </h4>
        <p className="text-sm text-zinc-500 mb-4">Desbloqueie badges exclusivos e acesso a ligas premium.</p>
        <Button variant="outline" className="w-full py-2">
          Ver Benefícios
        </Button>
      </Card>
    </div>
  );
}
