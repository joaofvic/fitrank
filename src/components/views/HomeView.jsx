import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { Trophy, Flame, Dumbbell, Crown, TrendingUp, Zap, ShieldAlert, ArrowUp, ArrowDown } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { UserAvatar } from '../ui/user-avatar.jsx';
import { LevelBadge } from '../ui/LevelBadge.jsx';
import { XpProgressBar } from '../ui/XpProgressBar.jsx';
import { LeagueBadge } from '../ui/LeagueBadge.jsx';
import { LeagueProgressView } from './LeagueProgressView.jsx';
import { StreakRecoveryModal } from './StreakRecoveryModal.jsx';
import { RankingSkeleton } from '../ui/Skeleton.jsx';
import { BoostShopDrawer } from './BoostShopDrawer.jsx';
import { calculateLevel } from '../../lib/profile-map.js';
import { fireConfetti } from '../../lib/confetti.js';

const VIRTUALIZE_THRESHOLD = 50;
const RANKING_ROW_HEIGHT = 76;

function RankingRow({ u, idx, currentUid, onOpenProfile, rankingFilterEnabled }) {
  return (
    <div
      role={onOpenProfile ? 'button' : undefined}
      tabIndex={onOpenProfile ? 0 : undefined}
      onClick={onOpenProfile ? () => onOpenProfile(u.uid) : undefined}
      onKeyDown={onOpenProfile ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenProfile(u.uid); } } : undefined}
      className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
        u.uid === currentUid
          ? 'bg-zinc-800/50 border-green-500/50 ring-1 ring-green-500/20'
          : 'bg-zinc-900 border-zinc-800'
      } ${onOpenProfile ? 'cursor-pointer hover:border-zinc-600 active:scale-[0.99]' : ''}`}
    >
      <div className="flex items-center gap-4">
        <div className="w-8 flex flex-col items-center">
          <span className="font-black text-zinc-600 italic">
            {idx + 1 === 1 ? '🥇' : idx + 1 === 2 ? '🥈' : idx + 1 === 3 ? '🥉' : `#${idx + 1}`}
          </span>
          {u.prevRank != null && u.prevRank !== u.rank && (
            u.rank < u.prevRank ? (
              <ArrowUp className="w-3 h-3 text-green-500 animate-bounce" style={{ animationDuration: '1.5s' }} />
            ) : (
              <ArrowDown className="w-3 h-3 text-red-500" />
            )
          )}
        </div>
        <UserAvatar src={u.avatar_url} size="lg" className="w-10 h-10 bg-zinc-800 border border-zinc-700" />
        <div>
          <p
            className={`font-bold flex items-center gap-1.5 ${
              u.uid === currentUid ? 'text-green-400' : 'text-white'
            }`}
          >
            <LevelBadge level={calculateLevel(u.xp)} size="sm" />
            {u.nome}
            {u.is_pro && <Crown className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
          </p>
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-zinc-500 uppercase tracking-tighter">
              {u.academia || 'Treino Livre'}
            </p>
            {u.league && <LeagueBadge league={u.league} size="sm" />}
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className="text-lg font-black text-white">{u.pontos || 0}</p>
        <p className="text-[10px] text-zinc-500 uppercase">
          {rankingFilterEnabled ? 'Pts período' : 'Pontos'}
        </p>
      </div>
    </div>
  );
}

function VirtualizedRanking({ displayUsers, currentUid, onOpenProfile, rankingFilterEnabled }) {
  const listRef = useRef(null);
  const offsetRef = useRef(0);

  useLayoutEffect(() => {
    offsetRef.current = listRef.current?.offsetTop ?? 0;
  });

  const virtualizer = useWindowVirtualizer({
    count: displayUsers.length,
    estimateSize: () => RANKING_ROW_HEIGHT,
    overscan: 8,
    scrollMargin: offsetRef.current,
    gap: 8,
  });

  return (
    <div
      ref={listRef}
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const u = displayUsers[virtualRow.index];
        return (
          <div
            key={u.uid}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            <RankingRow
              u={u}
              idx={virtualRow.index}
              currentUid={currentUid}
              onOpenProfile={onOpenProfile}
              rankingFilterEnabled={rankingFilterEnabled}
            />
          </div>
        );
      })}
    </div>
  );
}

function RankingList({ displayUsers, isRankingLoading, rankingTab, currentUid, onOpenProfile, rankingFilterEnabled }) {
  if (isRankingLoading && displayUsers.length === 0) {
    return <RankingSkeleton />;
  }
  if (displayUsers.length === 0) {
    return (
      <div className="text-center py-10 text-zinc-600">
        {rankingTab === 'league' ? 'Nenhum atleta na sua liga ainda.' : 'Nenhum atleta no ranking ainda.'}
      </div>
    );
  }
  if (displayUsers.length > VIRTUALIZE_THRESHOLD) {
    return (
      <VirtualizedRanking
        displayUsers={displayUsers}
        currentUid={currentUid}
        onOpenProfile={onOpenProfile}
        rankingFilterEnabled={rankingFilterEnabled}
      />
    );
  }
  return (
    <div className="space-y-2">
      {displayUsers.map((u, idx) => (
        <RankingRow
          key={u.uid}
          u={u}
          idx={idx}
          currentUid={currentUid}
          onOpenProfile={onOpenProfile}
          rankingFilterEnabled={rankingFilterEnabled}
        />
      ))}
    </div>
  );
}

const RANKING_PERIODS = [
  { id: 'day', label: 'Dia' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' }
];

const RANKING_TABS = [
  { id: 'general', label: 'Geral' },
  { id: 'league', label: 'Liga' }
];

export function HomeView({
  user,
  userData,
  allUsers,
  leagueUsers = [],
  onOpenCheckin,
  rankingLoading = false,
  rankingFilterEnabled = false,
  rankingPeriod = 'month',
  onRankingPeriodChange,
  rankingPeriodLabel = '',
  onOpenProfile,
  leagueLoading = false,
  onLoadLeagueRanking,
  onCheckStreakRecovery,
  onRecoverStreak,
  onGetBoostStatus,
  onPurchaseBoost
}) {
  const [rankingTab, setRankingTab] = useState('general');
  const [leagueDrawerOpen, setLeagueDrawerOpen] = useState(false);
  const [recoveryInfo, setRecoveryInfo] = useState(null);
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false);
  const [boostDrawerOpen, setBoostDrawerOpen] = useState(false);

  useEffect(() => {
    if (!onCheckStreakRecovery) return;
    onCheckStreakRecovery().then((info) => {
      if (info?.can_recover) setRecoveryInfo(info);
      else setRecoveryInfo(null);
    });
  }, [onCheckStreakRecovery]);

  useEffect(() => {
    if (!user?.uid || !allUsers?.length) return;
    const me = allUsers.find((u) => u.uid === user.uid);
    if (me?.rank <= 3 && me?.prevRank != null && me.prevRank > 3) {
      fireConfetti({ preset: 'gold', particleCount: 100 });
    }
  }, [allUsers, user?.uid]);

  const handleTabChange = (tab) => {
    setRankingTab(tab);
    if (tab === 'league' && onLoadLeagueRanking) {
      onLoadLeagueRanking();
    }
  };

  const displayUsers = rankingTab === 'league' ? leagueUsers : allUsers;
  const isRankingLoading = rankingTab === 'league' ? leagueLoading : rankingLoading;
  return (
    <div className="space-y-6 animate-in-fade">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LevelBadge level={userData?.level ?? 0} size="lg" />
            <div>
              <h2 className="text-zinc-400 text-sm font-medium">Bem-vindo de volta,</h2>
              <p className="text-2xl font-bold text-white flex items-center gap-2">
                {userData?.nome || 'Atleta'}
                {userData?.is_pro && <Crown className="w-5 h-5 text-yellow-500 fill-yellow-500" />}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
              <span className="text-orange-500 font-bold">{userData?.streak || 0}</span>
            </div>
            <button
              onClick={() => setBoostDrawerOpen(true)}
              className="bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:border-green-500/40 transition-colors active:scale-95"
            >
              <Zap className="w-4 h-4 text-green-500 fill-green-500" />
              <span className="text-green-500 font-bold">{userData?.pontos || 0}</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {userData?.levelInfo && (
            <div className="flex-1 min-w-0">
              <XpProgressBar
                currentXp={userData.levelInfo.currentXp}
                xpCurrentLevel={userData.levelInfo.xpCurrentLevel}
                xpNextLevel={userData.levelInfo.xpNextLevel}
                progressPct={userData.levelInfo.progressPct}
                level={userData.levelInfo.level}
              />
            </div>
          )}
          <LeagueBadge
            league={userData?.league ?? 'bronze'}
            size="sm"
            onClick={() => setLeagueDrawerOpen(true)}
          />
        </div>
      </div>

      {leagueDrawerOpen && (
        <LeagueProgressView
          currentLeague={userData?.league ?? 'bronze'}
          currentXp={userData?.xp ?? 0}
          onClose={() => setLeagueDrawerOpen(false)}
        />
      )}

      <Card className="bg-gradient-to-br from-green-500/20 to-zinc-900 border-green-500/30 overflow-hidden relative group">
        <div className="relative z-10 py-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-black text-white italic uppercase tracking-wider">Hora do Treino</h3>
              <p className="text-zinc-400 text-sm">Registre seu progresso diário</p>
            </div>
            <div className="bg-green-500 p-3 rounded-full shadow-lg shadow-green-500/20">
              <Dumbbell className="w-6 h-6 text-black" />
            </div>
          </div>
          <Button onClick={onOpenCheckin} className="w-full h-14 text-lg">
            TREINEI HOJE 💪
          </Button>
        </div>
        <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:opacity-20 transition-opacity">
          <TrendingUp size={120} className="text-green-500" />
        </div>
      </Card>

      {recoveryInfo && (
        <button
          onClick={() => setRecoveryModalOpen(true)}
          className="w-full bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 rounded-2xl p-4 flex items-center gap-3 text-left transition-all hover:border-orange-500/50 active:scale-[0.98]"
        >
          <div className="bg-orange-500/20 p-2.5 rounded-xl shrink-0">
            <ShieldAlert className="w-6 h-6 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Streak quebrado!</p>
            <p className="text-xs text-zinc-400 truncate">
              Recupere seu streak de {recoveryInfo.streak_before} {recoveryInfo.streak_before === 1 ? 'dia' : 'dias'}
            </p>
          </div>
          <span className="text-xs font-bold text-orange-500 bg-orange-500/10 px-2.5 py-1 rounded-full shrink-0">
            PRO
          </span>
        </button>
      )}

      {recoveryModalOpen && recoveryInfo && (
        <StreakRecoveryModal
          recoveryInfo={recoveryInfo}
          onRecover={async (gapDate) => {
            const res = await onRecoverStreak?.(gapDate);
            if (res?.success) setRecoveryInfo(null);
            return res;
          }}
          onClose={() => setRecoveryModalOpen(false)}
        />
      )}

      {boostDrawerOpen && (
        <BoostShopDrawer
          onGetStatus={onGetBoostStatus}
          onPurchase={onPurchaseBoost}
          onClose={() => setBoostDrawerOpen(false)}
        />
      )}

      <div className="space-y-4">
        <div className="space-y-2 px-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500 shrink-0" />
                Ranking de usuários
              </h3>
              {rankingFilterEnabled && rankingPeriodLabel ? (
                <p className="text-xs text-zinc-500 mt-0.5 capitalize">{rankingPeriodLabel}</p>
              ) : null}
            </div>
            <span className="text-xs text-zinc-500 shrink-0 pt-0.5">
              {isRankingLoading ? '…' : `${displayUsers.length} atletas`}
            </span>
          </div>
          {rankingFilterEnabled && (
            <div className="space-y-2">
              <div
                className="flex rounded-xl bg-zinc-900/80 border border-zinc-800 p-1 gap-1"
                role="tablist"
                aria-label="Tipo de ranking"
              >
                {RANKING_TABS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={rankingTab === id}
                    onClick={() => handleTabChange(id)}
                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                      rankingTab === id
                        ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                        : 'text-zinc-500 border border-transparent hover:text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {typeof onRankingPeriodChange === 'function' && (
                <div
                  className="flex rounded-xl bg-zinc-900/80 border border-zinc-800 p-1 gap-1"
                  role="tablist"
                  aria-label="Período do ranking"
                >
                  {RANKING_PERIODS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={rankingPeriod === id}
                      onClick={() => onRankingPeriodChange(id)}
                      className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                        rankingPeriod === id
                          ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                          : 'text-zinc-500 border border-transparent hover:text-zinc-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <RankingList
          displayUsers={displayUsers}
          isRankingLoading={isRankingLoading}
          rankingTab={rankingTab}
          currentUid={user?.uid}
          onOpenProfile={onOpenProfile}
          rankingFilterEnabled={rankingFilterEnabled}
        />
      </div>
    </div>
  );
}
