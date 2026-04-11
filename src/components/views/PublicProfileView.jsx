import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, Building2, CheckCircle2, Crown, Flame, Loader2, User, UserCheck, UserPlus, Zap
} from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { FeedPostCard } from './FeedPostCard.jsx';
import { CommentsDrawer } from './CommentsDrawer.jsx';

export function PublicProfileView({
  userId,
  onBack,
  onSendFriendRequest,
  onToggleLike,
  onAddComment,
  onLoadComments,
  onDeleteComment,
  currentUserId
}) {
  const { supabase } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [localFriendshipStatus, setLocalFriendshipStatus] = useState(null);
  const [posts, setPosts] = useState([]);
  const [commentsOpen, setCommentsOpen] = useState(null);

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

  useEffect(() => {
    if (!profile?.recent_checkins) { setPosts([]); return; }
    setPosts(
      profile.recent_checkins.map((c) => ({
        id: c.id,
        user_id: c.user_id ?? userId,
        display_name: profile.display_name,
        workout_type: c.tipo_treino,
        foto_url: c.foto_url,
        points_earned: c.points_awarded,
        created_at: c.created_at,
        likes_count: Number(c.likes_count ?? 0),
        comments_count: Number(c.comments_count ?? 0),
        has_liked: c.has_liked ?? false,
        caption: c.feed_caption ?? null
      }))
    );
  }, [profile, userId]);

  const handleToggleLike = useCallback((checkinId, currentlyLiked) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === checkinId
          ? { ...p, has_liked: !currentlyLiked, likes_count: p.likes_count + (currentlyLiked ? -1 : 1) }
          : p
      )
    );
    onToggleLike?.(checkinId, currentlyLiked);
  }, [onToggleLike]);

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

      {posts.length > 0 && (
        <div className="space-y-px -mx-4">
          <h3 className="font-bold text-sm text-zinc-400 uppercase tracking-wider px-4 mb-3">
            Postagens
          </h3>
          {posts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              onToggleLike={handleToggleLike}
              onOpenComments={(id) => setCommentsOpen(id)}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}

      {posts.length === 0 && !loading && (
        <div className="text-center py-10 border-2 border-dashed border-zinc-800 rounded-2xl">
          <p className="text-sm text-zinc-500">Nenhuma postagem ainda</p>
        </div>
      )}

      {commentsOpen && (
        <CommentsDrawer
          checkinId={commentsOpen}
          onClose={() => setCommentsOpen(null)}
          onLoadComments={onLoadComments}
          onAddComment={onAddComment}
          onDeleteComment={onDeleteComment}
          currentUserId={currentUserId}
          allowComments={posts.find((p) => p.id === commentsOpen)?.allow_comments !== false}
        />
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

