import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, Building2, CheckCircle2, Crown, Flame, Loader2, User, UserCheck, UserPlus, Zap
} from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { workoutTypeIcon } from '../../lib/workout-icons.js';

export function PublicProfileView({ userId, onBack, onSendFriendRequest }) {
  const { supabase } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [localFriendshipStatus, setLocalFriendshipStatus] = useState(null);

  const loadProfile = useCallback(async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_user_public_profile', {
        p_user_id: userId
      });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      if (data?.error) {
        setError(data.error);
        return;
      }
      setProfile(data);
      setLocalFriendshipStatus(data.friendship_status ?? null);
    } catch (err) {
      setError(err.message ?? 'Erro ao carregar perfil');
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSendRequest = async () => {
    if (!onSendFriendRequest || sendingRequest) return;
    setSendingRequest(true);
    try {
      const ok = await onSendFriendRequest(userId);
      if (ok) setLocalFriendshipStatus('pending');
    } finally {
      setSendingRequest(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="space-y-4 animate-in-fade">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
          <span className="text-sm font-semibold">Voltar</span>
        </button>
        <div className="text-center py-16 border-2 border-dashed border-zinc-800 rounded-2xl">
          <p className="text-sm text-zinc-500">{error || 'Perfil não encontrado'}</p>
        </div>
      </div>
    );
  }

  const created = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : '—';

  const checkins = Array.isArray(profile.recent_checkins) ? profile.recent_checkins : [];
  const groups = groupCheckinsByDate(checkins);

  return (
    <div className="space-y-6 animate-in-fade">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
        <ArrowLeft size={20} />
        <span className="text-sm font-semibold">Voltar</span>
      </button>

      <div className="text-center space-y-3 rounded-2xl bg-gradient-to-b from-green-500/5 to-transparent pt-8 pb-5 px-4 -mx-1">
        <div className="relative inline-block">
          <div className="w-24 h-24 rounded-full bg-zinc-800 ring-2 ring-green-500/30 flex items-center justify-center mx-auto shadow-2xl shadow-green-500/10">
            <User size={48} className="text-zinc-500" />
          </div>
          {profile.is_pro && (
            <div className="absolute -top-1 -right-1 bg-yellow-500 p-1.5 rounded-full ring-4 ring-black">
              <Crown size={12} className="text-black" />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-black flex items-center justify-center gap-2">
            {profile.display_name}
            {profile.is_pro && <Crown className="w-5 h-5 text-yellow-500 fill-yellow-500" />}
          </h2>
          <p className="text-sm text-zinc-500">Desde {created}</p>
          {profile.academia && (
            <span className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-zinc-800/60 text-zinc-400 border border-zinc-700/50">
              <Building2 className="w-3 h-3" />
              {profile.academia}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="flex flex-col items-center justify-center py-4 border-orange-500/20">
          <Flame className="w-6 h-6 text-orange-500 fill-orange-500 mb-1.5" />
          <span className="text-xl font-black tabular-nums">{profile.streak}</span>
          <span className="text-[10px] text-zinc-500 uppercase">
            {profile.streak === 1 ? 'Dia' : 'Dias'} Seguido{profile.streak !== 1 ? 's' : ''}
          </span>
        </Card>
        <Card className="flex flex-col items-center justify-center py-4 border-green-500/20">
          <Zap className="w-6 h-6 text-green-500 fill-green-500 mb-1.5" />
          <span className="text-xl font-black tabular-nums">{profile.pontos}</span>
          <span className="text-[10px] text-zinc-500 uppercase">Pontos</span>
        </Card>
        <Card className="flex flex-col items-center justify-center py-4 border-blue-500/20">
          <CheckCircle2 className="w-6 h-6 text-blue-500 mb-1.5" />
          <span className="text-xl font-black tabular-nums">{profile.approved_checkins_count}</span>
          <span className="text-[10px] text-zinc-500 uppercase">Treinos</span>
        </Card>
      </div>

      <FriendshipButton
        status={localFriendshipStatus}
        sending={sendingRequest}
        onSend={handleSendRequest}
      />

      {checkins.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-bold text-sm text-zinc-400 uppercase tracking-wider">Treinos recentes</h3>
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.date} className="space-y-2">
                <p className="text-[11px] font-bold uppercase text-zinc-500 tracking-wider px-1">
                  {group.label}
                </p>
                <div className="space-y-2">
                  {group.items.map((c) => {
                    const TypeIcon = workoutTypeIcon(c.tipo_treino);
                    return (
                      <div
                        key={c.id}
                        className="bg-zinc-900/50 border border-zinc-800 border-l-[3px] border-l-green-500 rounded-xl p-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                            {c.foto_url ? (
                              <img src={c.foto_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <TypeIcon className="w-6 h-6 text-zinc-400" />
                            )}
                          </div>
                          <p className="font-bold text-sm text-white truncate">{c.tipo_treino}</p>
                        </div>
                        <span className="shrink-0 px-2 py-1 rounded-lg text-xs font-bold tabular-nums bg-green-500/10 text-green-500">
                          +{c.points_awarded ?? 0} PTS
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FriendshipButton({ status, sending, onSend }) {
  if (status === 'accepted') {
    return (
      <div className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-zinc-800/40 border border-zinc-700/50 text-zinc-400">
        <UserCheck className="w-5 h-5" />
        <span className="text-sm font-bold">Amigos</span>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-zinc-800/40 border border-zinc-700/50 text-zinc-500">
        <Loader2 className="w-4 h-4" />
        <span className="text-sm font-bold">Solicitação enviada</span>
      </div>
    );
  }

  if (status === 'declined') {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onSend}
      disabled={sending}
      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-50"
    >
      {sending ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <UserPlus className="w-5 h-5" />
      )}
      {sending ? 'Enviando...' : 'Adicionar amigo'}
    </button>
  );
}

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
    const date = c.date ?? c.checkin_local_date;
    if (date !== currentKey) {
      currentKey = date;
      currentGroup = { date, label: formatDateLabel(date), items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(c);
  }
  return groups;
}
