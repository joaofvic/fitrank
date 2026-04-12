import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, Building2, CheckCircle2, Crown, Flame, Loader2, User, UserCheck, UserMinus, UserPlus, Zap
} from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { FeedPostCard } from './FeedPostCard.jsx';
import { CommentsDrawer } from './CommentsDrawer.jsx';
import { LikesDrawer } from './LikesDrawer.jsx';

export function PublicProfileView({
  userId,
  onBack,
  onSendFriendRequest,
  onToggleLike,
  onAddComment,
  onLoadComments,
  onDeleteComment,
  onLoadLikes,
  currentUserId,
  onUpdatePrivacy,
  onRemoveFriend
}) {
  const { supabase } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [removingFriend, setRemovingFriend] = useState(false);
  const [localFriendshipStatus, setLocalFriendshipStatus] = useState(null);
  const [friendshipId, setFriendshipId] = useState(null);
  const [posts, setPosts] = useState([]);
  const [commentsOpen, setCommentsOpen] = useState(null);
  const [likesOpen, setLikesOpen] = useState(null);

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

      if (data.friendship_status === 'accepted' && currentUserId) {
        const { data: fRow } = await supabase
          .from('friendships')
          .select('id')
          .eq('status', 'accepted')
          .or(`and(requester_id.eq.${userId},addressee_id.eq.${currentUserId}),and(requester_id.eq.${currentUserId},addressee_id.eq.${userId})`)
          .limit(1)
          .maybeSingle();
        setFriendshipId(fRow?.id ?? null);
      }
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
        avatar_url: profile.avatar_url ?? null,
        workout_type: c.tipo_treino,
        foto_url: c.foto_url,
        points_earned: c.points_awarded,
        created_at: c.created_at,
        likes_count: Number(c.likes_count ?? 0),
        comments_count: Number(c.comments_count ?? 0),
        has_liked: c.has_liked ?? false,
        caption: c.feed_caption ?? null,
        allow_comments: c.allow_comments ?? true,
        hide_likes_count: c.hide_likes_count ?? false
      }))
    );
  }, [profile, userId]);

  const handleUpdatePrivacy = useCallback(async (checkinId, fields) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === checkinId ? { ...p, ...fields } : p))
    );
    await onUpdatePrivacy?.(checkinId, fields);
  }, [onUpdatePrivacy]);

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

  const handleRemoveFriend = async () => {
    if (!onRemoveFriend || !friendshipId || removingFriend) return;
    setRemovingFriend(true);
    try {
      const ok = await onRemoveFriend(friendshipId);
      if (ok) {
        setLocalFriendshipStatus(null);
        setFriendshipId(null);
      }
    } finally {
      setRemovingFriend(false);
    }
  };

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
          <div className="w-24 h-24 rounded-full bg-zinc-800 ring-2 ring-green-500/30 overflow-hidden flex items-center justify-center mx-auto shadow-2xl shadow-green-500/10">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User size={48} className="text-zinc-500" />
            )}
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
          {profile.username && (
            <p className="text-sm text-zinc-400">@{profile.username}</p>
          )}
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
        removing={removingFriend}
        onSend={handleSendRequest}
        onRemove={handleRemoveFriend}
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
              onOpenLikes={(id) => setLikesOpen(id)}
              currentUserId={currentUserId}
              onUpdatePrivacy={handleUpdatePrivacy}
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

      {likesOpen && (
        <LikesDrawer
          checkinId={likesOpen}
          onClose={() => setLikesOpen(null)}
          onLoadLikes={onLoadLikes}
          onOpenProfile={(uid) => { setLikesOpen(null); }}
        />
      )}
    </div>
  );
}

function FriendshipButton({ status, sending, removing, onSend, onRemove }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (status === 'accepted') {
    if (confirmOpen) {
      return (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            disabled={removing}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-sm hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => { onRemove?.(); setConfirmOpen(false); }}
            disabled={removing}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 font-bold text-sm hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {removing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserMinus className="w-4 h-4" />
            )}
            {removing ? 'Removendo...' : 'Desfazer amizade'}
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-zinc-800/40 border border-zinc-700/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300 transition-colors"
      >
        <UserCheck className="w-5 h-5" />
        <span className="text-sm font-bold">Amigos</span>
      </button>
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

