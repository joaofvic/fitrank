import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Flame, Zap, CheckCircle2, Trophy, Users,
  Share2, Loader2, Star
} from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { LineChart } from '../ui/charts/LineChart.jsx';
import { DonutChart } from '../ui/charts/DonutChart.jsx';
import { BarChart } from '../ui/charts/BarChart.jsx';
import { Sparkline } from '../ui/charts/Sparkline.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { logger } from '../../lib/logger.js';
import { UserAvatar } from '../ui/user-avatar.jsx';

const PERIOD_OPTIONS = [
  { id: 30, label: '30d' },
  { id: 90, label: '90d' },
  { id: 180, label: '6m' },
  { id: 365, label: '1a' },
];

function KpiCard({ icon: Icon, iconColor, label, value }) {
  return (
    <Card className="flex flex-col items-center justify-center py-3 text-center">
      <Icon className={`w-5 h-5 mb-1 ${iconColor}`} />
      <span className="text-xl font-black tabular-nums text-white">{value}</span>
      <span className="text-[10px] text-zinc-500 uppercase font-bold">{label}</span>
    </Card>
  );
}

function formatWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function aggregateWeekly(daily) {
  if (!daily || daily.length === 0) return [];
  const weeks = {};
  for (const d of daily) {
    const dt = new Date(d.date + 'T00:00:00');
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    const key = monday.toISOString().split('T')[0];
    weeks[key] = (weeks[key] || 0) + d.count;
  }
  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

function FriendSelector({ friends, selected, onToggle }) {
  if (!friends || friends.length === 0) {
    return <p className="text-xs text-zinc-600 text-center py-3">Adicione amigos para comparar</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {friends.slice(0, 10).map((f) => {
        const isSelected = selected.includes(f.uid || f.id);
        return (
          <button
            key={f.uid || f.id}
            type="button"
            onClick={() => onToggle(f.uid || f.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              isSelected
                ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-600'
            }`}
          >
            <UserAvatar src={f.avatar_url} size="xs" className="w-5 h-5" />
            <span className="truncate max-w-20">{f.display_name || f.username || 'Amigo'}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StatsView({ onBack, friends = [], refreshRef }) {
  const { supabase, session, profile } = useAuth();
  const userId = session?.user?.id;
  const shareRef = useRef(null);

  const [period, setPeriod] = useState(90);
  const [stats, setStats] = useState(null);
  const [weightData, setWeightData] = useState([]);
  const [comparison, setComparison] = useState([]);
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compLoading, setCompLoading] = useState(false);
  const [sharing, setSharing] = useState(false);

  const loadStats = useCallback(async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    try {
      const [statsRes, weightRes] = await Promise.all([
        supabase.rpc('get_user_workout_stats', { p_user_id: userId, p_days: period }),
        supabase.rpc('get_user_weight_trend', { p_user_id: userId, p_days: period }),
      ]);
      if (statsRes.error) throw statsRes.error;
      setStats(statsRes.data);
      setWeightData(weightRes.data || []);
    } catch (e) {
      logger.error('load stats', e);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, period]);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    if (refreshRef) refreshRef.current = loadStats;
    return () => { if (refreshRef) refreshRef.current = null; };
  }, [refreshRef, loadStats]);

  const loadComparison = useCallback(async () => {
    if (!supabase || !userId || selectedFriends.length === 0) {
      setComparison([]);
      return;
    }
    setCompLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_friend_comparison', {
        p_user_id: userId,
        p_friend_ids: selectedFriends.slice(0, 3),
      });
      if (error) throw error;
      setComparison(data || []);
    } catch (e) {
      logger.error('load comparison', e);
    } finally {
      setCompLoading(false);
    }
  }, [supabase, userId, selectedFriends]);

  useEffect(() => { loadComparison(); }, [loadComparison]);

  const toggleFriend = useCallback((id) => {
    setSelectedFriends((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }, []);

  const weeklyData = useMemo(() => aggregateWeekly(stats?.daily), [stats?.daily]);
  const weightSeries = useMemo(() => weightData.map((w) => Number(w.weight_kg)), [weightData]);

  const bestStreak = useMemo(() => {
    const daily = stats?.daily;
    if (!daily || daily.length === 0) return 0;
    const dateSet = new Set(daily.map((d) => d.date));
    let max = 0;
    let current = 0;
    const sorted = [...dateSet].sort();
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) { current = 1; }
      else {
        const prev = new Date(sorted[i - 1] + 'T00:00:00');
        const curr = new Date(sorted[i] + 'T00:00:00');
        const diff = (curr - prev) / 86400000;
        current = diff === 1 ? current + 1 : 1;
      }
      if (current > max) max = current;
    }
    return max;
  }, [stats?.daily]);

  const comparisonBarData = useMemo(() => {
    if (!comparison || comparison.length === 0) return [];
    return comparison.map((c) => ({
      label: (c.display_name || '?').split(' ')[0],
      checkins: c.checkins_30d,
      pontos: c.pontos,
      streak: c.streak,
      isMe: c.user_id === userId,
    }));
  }, [comparison, userId]);

  const handleShare = async () => {
    if (!shareRef.current) return;
    setSharing(true);
    try {
      const text = [
        `📊 Minhas Estatísticas FitRank`,
        `💪 ${stats?.totals?.total_checkins || 0} treinos nos últimos ${period} dias`,
        `🔥 Streak: ${profile?.streak || 0} dias`,
        `⭐ Recorde: ${bestStreak} dias`,
        `⚡ ${profile?.pontos || 0} pontos`,
      ].join('\n');
      if (navigator.share) {
        await navigator.share({ title: 'FitRank Stats', text });
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // cancelled or clipboard fallback failed
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-in-fade">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors">
            <ChevronLeft size={20} />
            <span className="text-sm font-semibold">Voltar</span>
          </button>
          <h2 className="text-lg font-black uppercase tracking-tight">Estatísticas</h2>
          <div className="w-16" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-zinc-900 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div ref={shareRef} className="space-y-5 animate-in-fade">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors">
          <ChevronLeft size={20} />
          <span className="text-sm font-semibold">Voltar</span>
        </button>
        <h2 className="text-lg font-black uppercase tracking-tight">Estatísticas</h2>
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
          aria-label="Compartilhar"
        >
          {sharing ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
        </button>
      </div>

      <div className="flex rounded-xl bg-zinc-900/80 border border-zinc-800 p-1 gap-1">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setPeriod(opt.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-colors ${
              period === opt.id
                ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                : 'text-zinc-500 border border-transparent hover:text-zinc-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <KpiCard icon={CheckCircle2} iconColor="text-blue-500" label="Treinos" value={stats?.totals?.total_checkins ?? 0} />
        <KpiCard icon={Flame} iconColor="text-orange-500 fill-orange-500" label="Dias ativos" value={stats?.totals?.active_days ?? 0} />
        <KpiCard icon={Zap} iconColor="text-green-500 fill-green-500" label="Pontos" value={profile?.pontos ?? 0} />
        <KpiCard icon={Trophy} iconColor="text-yellow-500" label="Streak atual" value={profile?.streak ?? 0} />
        <KpiCard icon={Star} iconColor="text-amber-400 fill-amber-400" label="Streak recorde" value={bestStreak} />
      </div>

      {weeklyData.length >= 2 && (
        <Card className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Frequência Semanal</h3>
          <LineChart
            data={weeklyData}
            xKey="date"
            yKey="count"
            label="Treinos"
            formatX={formatWeek}
          />
        </Card>
      )}

      {stats?.by_type?.length > 0 && (
        <Card className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Tipos de Treino</h3>
          <DonutChart data={stats.by_type} nameKey="type" valueKey="count" size={140} />
        </Card>
      )}

      {weightData.length >= 2 && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Evolução de Peso</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tabular-nums text-white">
                {weightSeries[weightSeries.length - 1]?.toFixed(1)} kg
              </span>
              <Sparkline data={weightSeries} width={60} height={20} />
            </div>
          </div>
          <LineChart
            data={weightData}
            xKey="date"
            yKey="weight_kg"
            label="Peso (kg)"
            color="rgb(59 130 246)"
            formatX={formatWeek}
            formatY={(v) => `${v}kg`}
          />
        </Card>
      )}

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-purple-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Comparativo com Amigos
          </h3>
        </div>
        <FriendSelector friends={friends} selected={selectedFriends} onToggle={toggleFriend} />
        {compLoading && (
          <div className="flex justify-center py-4">
            <Loader2 size={20} className="animate-spin text-zinc-600" />
          </div>
        )}
        {!compLoading && comparisonBarData.length > 0 && (
          <BarChart
            data={comparisonBarData}
            labelKey="label"
            categories={[
              { key: 'checkins', label: 'Treinos (30d)' },
              { key: 'pontos', label: 'Pontos' },
              { key: 'streak', label: 'Streak' },
            ]}
            height={160}
          />
        )}
      </Card>
    </div>
  );
}
