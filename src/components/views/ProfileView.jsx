import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera, Flame, Zap, Calendar, CheckCircle2, Crown, RefreshCw,
  Settings, X, Building2, Trophy, Users, Shield, SlidersHorizontal, BarChart3, ScrollText, LogOut,
  Clock, Check, ChevronLeft, ChevronRight, Loader2, CreditCard, Activity
} from 'lucide-react';
import { UserAvatar } from '../ui/user-avatar.jsx';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';
import { logger } from '../../lib/logger.js';
import { workoutTypeIcon } from '../../lib/workout-icons.js';
import { FriendsListDrawer } from './FriendsListDrawer.jsx';
import { BadgesGrid } from './BadgesGrid.jsx';
import { LevelBadge } from '../ui/LevelBadge.jsx';
import { ProfileFullSkeleton, ProfileStatsSkeleton } from '../ui/Skeleton.jsx';
import { XpProgressBar } from '../ui/XpProgressBar.jsx';
import { LeagueBadge } from '../ui/LeagueBadge.jsx';
import { ConsistencyHeatmap } from '../ui/ConsistencyHeatmap.jsx';
import { ProgressWidget } from '../ui/ProgressWidget.jsx';
import { WorkoutPlanWidget } from '../ui/WorkoutPlanWidget.jsx';
import { Sheet, SheetContent, SheetTitle } from '../ui/sheet.jsx';

export function ProfileView({
  userData,
  checkins,
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
  onOpenBilling,
  onOpenObservability,
  onEditProfile,
  onRetryCheckin,
  friends = [],
  friendsLoading = false,
  onLoadFriends,
  onRemoveFriend,
  onOpenProfile,
  badges = [],
  badgesLoading = false,
  onLoadBadges,
  checkinPage = 0,
  checkinLimit = 10,
  checkinCount = 0,
  checkinApprovedCount,
  checkinsLoading = false,
  onPageChange,
  onLimitChange,
  onSignOut,
  onOpenProgress,
  onOpenStats,
  onOpenPlan,
  onGeneratePlan
}) {
  const { supabase, session, profile: authProfile } = useAuth();
  const [reasonLabelMap, setReasonLabelMap] = useState({});
  const [availablePlans, setAvailablePlans] = useState([]);
  const [proLoading, setProLoading] = useState(false);
  const isPro = userData?.is_pro || authProfile?.is_pro;

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

  useEffect(() => {
    if (!supabase || isPro) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('subscription_plans')
        .select('id, name, cakto_offer_id, price_amount, currency, interval, interval_count, features')
        .eq('is_active', true)
        .order('sort_order');
      if (!cancelled && data) setAvailablePlans(data);
    })();
    return () => { cancelled = true; };
  }, [supabase, isPro]);

  const handleSubscribe = useCallback(async (caktoOfferId) => {
    if (!supabase || proLoading) return;
    setProLoading(true);
    try {
      const { data, error } = await invokeEdge('cakto-checkout', supabase, {
        method: 'POST',
        body: { offer_id: caktoOfferId }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      logger.error('checkout failed', err);
      alert(err.message || 'Erro ao iniciar assinatura.');
    } finally {
      setProLoading(false);
    }
  }, [supabase, proLoading]);

  const [adminOpen, setAdminOpen] = useState(false);
  const [friendsDrawerOpen, setFriendsDrawerOpen] = useState(false);

  useEffect(() => { onLoadFriends?.(); }, [onLoadFriends]);
  useEffect(() => { onLoadBadges?.(); }, [onLoadBadges]);

  const [retryingId, setRetryingId] = useState(null);
  const retryFileRef = useRef(null);
  const retryTargetRef = useRef(null);

  const handleRetryFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !retryTargetRef.current || !onRetryCheckin) return;
      setRetryingId(retryTargetRef.current);
      try {
        await onRetryCheckin(retryTargetRef.current, file);
      } catch (err) {
        logger.error('retry failed', err);
        alert(err.message || 'Erro ao reenviar foto.');
      } finally {
        setRetryingId(null);
        retryTargetRef.current = null;
      }
    },
    [onRetryCheckin]
  );

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

  function formatDateLabel(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((today - target) / 86400000);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    const day = d.getDate();
    const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    if (d.getFullYear() === now.getFullYear()) return `${day} ${month}`;
    return `${day} ${month} ${d.getFullYear()}`;
  }

  function groupCheckinsByDate(list) {
    const groups = [];
    let currentKey = null;
    let currentGroup = null;
    for (const c of list) {
      if (c.date !== currentKey) {
        currentKey = c.date;
        currentGroup = { date: c.date, label: formatDateLabel(c.date), items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(c);
    }
    return groups;
  }

  const checkinGroups = checkins.length > 0 ? groupCheckinsByDate(checkins) : [];

  if (!userData) {
    return (
      <div className="space-y-6 animate-in-fade px-1 pt-4">
        <ProfileFullSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in-fade">
      <div className="text-center space-y-3 rounded-2xl bg-gradient-to-b from-green-500/5 to-transparent pt-8 pb-5 px-4 -mx-1">
        <div className="relative inline-block">
          <UserAvatar src={userData?.avatar_url} size="xl" className="w-24 h-24 bg-zinc-800 ring-2 ring-green-500/30 mx-auto shadow-2xl shadow-green-500/10" />
          {onEditProfile && (
            <button
              type="button"
              onClick={onEditProfile}
              className="absolute bottom-0 right-0 bg-green-500 p-1.5 rounded-full ring-4 ring-black"
            >
              <Camera size={14} className="text-black" />
            </button>
          )}
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-black">{displayNome}</h2>
          {userData?.username && (
            <p className="text-sm text-zinc-400">@{userData.username}</p>
          )}
          <p className="text-sm text-zinc-500">Desde {created}</p>
          {cloudTenant && (
            <span className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-zinc-800/60 text-zinc-400 border border-zinc-700/50">
              <Building2 className="w-3 h-3" />
              {cloudTenant.name || cloudTenant.slug}
            </span>
          )}
        </div>
        {onEditProfile && (
          <button
            type="button"
            onClick={onEditProfile}
            className="mt-2 px-6 py-1.5 rounded-lg text-sm font-bold bg-zinc-800 border border-zinc-700 text-white hover:bg-zinc-700 transition-colors"
          >
            Editar perfil
          </button>
        )}
      </div>

      {userData?.levelInfo && (
        <Card className="flex items-center gap-4 py-3 px-4 border-green-500/20">
          <LevelBadge level={userData.levelInfo.level} size="lg" />
          <div className="flex-1 min-w-0">
            <XpProgressBar
              currentXp={userData.levelInfo.currentXp}
              xpCurrentLevel={userData.levelInfo.xpCurrentLevel}
              xpNextLevel={userData.levelInfo.xpNextLevel}
              progressPct={userData.levelInfo.progressPct}
              level={userData.levelInfo.level}
            />
          </div>
          <LeagueBadge league={userData?.league ?? 'bronze'} size="md" />
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="flex flex-col items-center justify-center py-4 border-orange-500/20">
          <Flame className="w-6 h-6 text-orange-500 fill-orange-500 mb-1.5" />
          <span className="text-xl font-black tabular-nums">{userData?.streak || 0}</span>
          <span className="text-[10px] text-zinc-500 uppercase">
            {(userData?.streak || 0) === 1 ? 'Dia' : 'Dias'} Seguido{(userData?.streak || 0) !== 1 ? 's' : ''}
          </span>
        </Card>
        <Card className="flex flex-col items-center justify-center py-4 border-green-500/20">
          <Zap className="w-6 h-6 text-green-500 fill-green-500 mb-1.5" />
          <span className="text-xl font-black tabular-nums">{userData?.pontos || 0}</span>
          <span className="text-[10px] text-zinc-500 uppercase">Pontos</span>
        </Card>
        <Card className="flex flex-col items-center justify-center py-4 border-blue-500/20">
          <CheckCircle2 className="w-6 h-6 text-blue-500 mb-1.5" />
          <span className="text-xl font-black tabular-nums">
            {checkinApprovedCount ?? checkins.filter((c) => c.photo_review_status !== 'rejected').length}
          </span>
          <span className="text-[10px] text-zinc-500 uppercase">Treinos</span>
        </Card>
        <button type="button" onClick={() => setFriendsDrawerOpen(true)} className="text-left">
          <Card className="flex flex-col items-center justify-center py-4 border-purple-500/20 hover:bg-zinc-800/50 transition-colors cursor-pointer h-full">
            <Users className="w-6 h-6 text-purple-500 mb-1.5" />
            <span className="text-xl font-black tabular-nums">{friends.length}</span>
            <span className="text-[10px] text-zinc-500 uppercase">
              {friends.length === 1 ? 'Amigo' : 'Amigos'}
            </span>
          </Card>
        </button>
      </div>

      <BadgesGrid
        badges={badges}
        loading={badgesLoading}
        currentValues={{
          streak: userData?.streak || 0,
          checkins: checkinApprovedCount ?? checkins.filter((c) => c.photo_review_status !== 'rejected').length,
          points: userData?.pontos || 0,
          social: friends.length
        }}
        isPro={isPro}
      />

      {session?.user?.id && (
        <ConsistencyHeatmap userId={session.user.id} />
      )}

      {session?.user?.id && (
        <ProgressWidget userId={session.user.id} onOpenProgress={onOpenProgress} />
      )}

      {onOpenStats && (
        <button type="button" onClick={onOpenStats} className="w-full text-left">
          <Card className="flex items-center justify-between hover:border-green-500/30 transition-colors group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-300">Estatísticas</p>
                <p className="text-[10px] text-zinc-500">Gráficos e evolução detalhada</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-zinc-600 group-hover:text-purple-500 transition-colors" />
          </Card>
        </button>
      )}

      {session?.user?.id && (
        <WorkoutPlanWidget
          userId={session.user.id}
          onOpenPlan={onOpenPlan}
          onGenerateNew={onGeneratePlan}
        />
      )}

      {isPlatformMaster && (
        <Button
          variant="outline"
          className="w-full py-2.5 text-sm"
          onClick={() => setAdminOpen(true)}
        >
          <Settings className="w-4 h-4" />
          Painel do Administrador
        </Button>
      )}

      <Sheet open={adminOpen} onOpenChange={setAdminOpen}>
        <SheetContent side="bottom" className="max-w-lg mx-auto p-5 pb-8" showClose={false}>
          <div className="flex items-center justify-between mb-5">
            <SheetTitle className="text-sm font-black uppercase tracking-wide text-zinc-300">
              Painel do Administrador
            </SheetTitle>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { fn: onOpenAdmin, icon: Building2, label: 'Tenants' },
              { fn: onOpenChallenges, icon: Trophy, label: 'Desafios' },
              { fn: onOpenUsers, icon: Users, label: 'Usuários' },
              { fn: onOpenModeration, icon: Shield, label: 'Moderação' },
              { fn: onOpenModerationSettings, icon: SlidersHorizontal, label: 'Config moderação' },
              { fn: onOpenEngagement, icon: BarChart3, label: 'Engajamento' },
              { fn: onOpenObservability, icon: Activity, label: 'Observabilidade' },
              { fn: onOpenAudit, icon: ScrollText, label: 'Auditoria' },
              { fn: onOpenBilling, icon: CreditCard, label: 'Assinaturas' }
            ]
              .filter((item) => Boolean(item.fn))
              .map(({ fn, icon: Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setAdminOpen(false); fn(); }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-800/40 p-4 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                >
                  <Icon className="w-5 h-5 text-green-500" />
                  <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
                </button>
              ))}
          </div>
        </SheetContent>
      </Sheet>

      {friendsDrawerOpen && (
        <FriendsListDrawer
          friends={friends}
          loading={friendsLoading}
          onClose={() => setFriendsDrawerOpen(false)}
          onOpenProfile={onOpenProfile}
          onRemove={onRemoveFriend}
        />
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-zinc-400" />
            Histórico de Treinos
          </h3>
          {onLimitChange && checkinCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500">Exibir:</span>
              {[5, 10, 20, 50].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onLimitChange(n)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                    checkinLimit === n
                      ? 'bg-green-500/10 text-green-500 border border-green-500/30'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          ref={retryFileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleRetryFile}
        />

        {checkins.length === 0 && !checkinsLoading ? (
          <div className="text-center py-10 border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-600">
            Você ainda não registrou nenhum treino.
          </div>
        ) : (
          <div className={`space-y-5 transition-opacity ${checkinsLoading ? 'opacity-50' : ''}`}>
            {checkinsLoading && checkins.length === 0 && (
              <ProfileStatsSkeleton />
            )}
            {checkinGroups.map((group) => (
              <div key={group.date} className="space-y-2">
                <p className="text-[11px] font-bold uppercase text-zinc-500 tracking-wider px-1">
                  {group.label}
                </p>
                <div className="space-y-2">
                  {group.items.map((c) => {
                    const status = c.photo_review_status ?? 'approved';
                    const borderColor = status === 'rejected'
                      ? 'border-l-red-500'
                      : status === 'pending'
                        ? 'border-l-yellow-500'
                        : 'border-l-green-500';
                    const TypeIcon = workoutTypeIcon(c.type);
                    const overlayColors = status === 'rejected'
                      ? 'bg-red-500 text-white'
                      : status === 'pending'
                        ? 'bg-yellow-500 text-black'
                        : 'bg-green-500 text-black';
                    const OverlayIcon = status === 'rejected' ? X : status === 'pending' ? Clock : Check;

                    return (
                      <div
                        key={c.id}
                        className={`bg-zinc-900/50 border border-zinc-800 border-l-[3px] ${borderColor} rounded-xl p-3 flex items-start justify-between gap-3`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center overflow-hidden">
                              {c.foto_url ? (
                                <img src={c.foto_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <TypeIcon className="w-6 h-6 text-zinc-400" />
                              )}
                            </div>
                            <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-zinc-900 ${overlayColors}`}>
                              <OverlayIcon className="w-3 h-3" strokeWidth={3} />
                            </div>
                          </div>

                          <div className="min-w-0 space-y-1">
                            <p className="font-bold text-sm text-white truncate">{c.type}</p>

                            {status === 'rejected' ? (
                              <div className="space-y-1.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20">
                                  Foto rejeitada
                                </span>
                                {c.photo_rejection_reason_code ? (
                                  <p className="text-[11px] text-zinc-500 truncate">
                                    {rejectionReasonLabel(c.photo_rejection_reason_code)}
                                    {c.photo_rejection_note ? ` · ${c.photo_rejection_note}` : ''}
                                  </p>
                                ) : c.photo_rejection_note ? (
                                  <p className="text-[11px] text-zinc-500 truncate">{c.photo_rejection_note}</p>
                                ) : null}
                                {onRetryCheckin ? (
                                  <button
                                    type="button"
                                    disabled={retryingId === c.id}
                                    onClick={() => {
                                      retryTargetRef.current = c.id;
                                      retryFileRef.current?.click();
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                                  >
                                    <RefreshCw className={`w-3 h-3 ${retryingId === c.id ? 'animate-spin' : ''}`} />
                                    {retryingId === c.id ? 'Reenviando…' : 'Reenviar foto'}
                                  </button>
                                ) : null}
                              </div>
                            ) : status === 'pending' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                                <Clock className="w-3 h-3" />
                                Aguardando revisão
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div
                          className={`shrink-0 px-2 py-1 rounded-lg text-xs font-bold tabular-nums whitespace-nowrap ${
                            status === 'rejected'
                              ? 'text-zinc-600 line-through'
                              : status === 'pending'
                                ? 'bg-yellow-500/10 text-yellow-400'
                                : 'bg-green-500/10 text-green-500'
                          }`}
                        >
                          {status === 'rejected'
                            ? '0 PTS'
                            : `+${c.points_earned ?? 0} PTS`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {onPageChange && checkinCount > checkinLimit && (() => {
          const totalPages = Math.ceil(checkinCount / checkinLimit);
          const current = checkinPage;

          const pages = [];
          for (let i = 0; i < totalPages; i++) {
            if (
              i === 0 ||
              i === totalPages - 1 ||
              (i >= current - 1 && i <= current + 1)
            ) {
              pages.push(i);
            } else if (pages[pages.length - 1] !== -1) {
              pages.push(-1);
            }
          }

          return (
            <div className="flex items-center justify-center gap-1.5 pt-3">
              <button
                type="button"
                disabled={current === 0 || checkinsLoading}
                onClick={() => onPageChange(current - 1)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {pages.map((p, idx) =>
                p === -1 ? (
                  <span key={`ellipsis-${idx}`} className="text-zinc-600 text-xs px-1">...</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    disabled={checkinsLoading}
                    onClick={() => onPageChange(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                      p === current
                        ? 'bg-green-500/10 text-green-500 border border-green-500/30'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    {p + 1}
                  </button>
                )
              )}

              <button
                type="button"
                disabled={current >= totalPages - 1 || checkinsLoading}
                onClick={() => onPageChange(current + 1)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="text-[10px] text-zinc-600 ml-2 tabular-nums">
                {current + 1}/{totalPages}
              </span>
            </div>
          );
        })()}
      </div>

      {isPro ? (
        <Card className="bg-gradient-to-br from-yellow-500/5 via-transparent to-yellow-500/5 border-yellow-500/20">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-500 drop-shadow-[0_0_6px_rgba(234,179,8,0.4)]" />
              Membro PRO
            </h4>
            <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              Ativo
            </span>
          </div>
          <p className="text-sm text-zinc-500">Você tem acesso a todos os benefícios PRO.</p>
        </Card>
      ) : (
        <Card className="bg-gradient-to-br from-yellow-500/5 via-transparent to-yellow-500/5 border-dashed border-yellow-500/20">
          <h4 className="font-bold mb-1 flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500 drop-shadow-[0_0_6px_rgba(234,179,8,0.4)]" />
            Seja um Membro PRO
          </h4>
          <p className="text-sm text-zinc-500 mb-4">Desbloqueie badges exclusivos e acesso a ligas premium.</p>
          {availablePlans.length > 0 ? (
            <div className="space-y-2">
              {availablePlans.map(plan => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => handleSubscribe(plan.cakto_offer_id)}
                  disabled={proLoading || !plan.cakto_offer_id}
                  className="w-full flex items-center justify-between gap-3 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 rounded-xl px-4 py-3 transition-colors disabled:opacity-50"
                >
                  <div className="text-left min-w-0">
                    <p className="font-bold text-sm text-white">{plan.name}</p>
                    {plan.features?.length > 0 && (
                      <p className="text-[10px] text-zinc-500 truncate">{plan.features.slice(0, 2).join(' · ')}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-black text-yellow-400 tabular-nums">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: (plan.currency || 'brl').toUpperCase() }).format(plan.price_amount / 100)}
                    </span>
                    <span className="text-[10px] text-zinc-500 block">
                      /{plan.interval === 'year' ? 'ano' : 'mês'}
                    </span>
                  </div>
                </button>
              ))}
              {proLoading && (
                <div className="flex justify-center py-2">
                  <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                </div>
              )}
            </div>
          ) : (
            <Button variant="secondary" className="w-full py-2" disabled>
              Em breve
            </Button>
          )}
        </Card>
      )}

      {onSignOut && (
        <Button variant="ghost" className="w-full mt-2 py-2 text-sm text-zinc-500" onClick={onSignOut}>
          <LogOut className="w-4 h-4" />
          Sair da conta
        </Button>
      )}
    </div>
  );
}
