import { useState, useRef, useEffect } from 'react';
import { Heart, MessageCircle, MessageCircleOff, MoreHorizontal, User, EyeOff, Eye, Trash2 } from 'lucide-react';
import { formatTimeAgo } from '../../lib/dates.js';
import { workoutTypeIcon } from '../../lib/workout-icons.js';

export function FeedPostCard({ post, onToggleLike, onOpenComments, onOpenLikes, onOpenProfile, currentUserId, onUpdatePrivacy, onDeletePost }) {
  const [animating, setAnimating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const isOwner = currentUserId === post.user_id;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const TypeIcon = workoutTypeIcon(post.workout_type);

  const handleLike = () => {
    setAnimating(true);
    onToggleLike?.(post.id, post.has_liked);
    setTimeout(() => setAnimating(false), 300);
  };

  const handleDoubleTap = () => {
    if (post.has_liked) return;
    handleLike();
  };

  return (
    <div className="bg-black border-b border-zinc-800/60">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onOpenProfile ? () => onOpenProfile(post.user_id) : undefined}
          disabled={!onOpenProfile}
          className={`flex items-center gap-3 min-w-0 flex-1 text-left ${onOpenProfile ? 'cursor-pointer' : ''}`}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500/30 to-zinc-800 p-[2px] shrink-0">
            <div className="w-full h-full rounded-full bg-zinc-900 overflow-hidden flex items-center justify-center">
              {post.avatar_url ? (
                <img src={post.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-3.5 h-3.5 text-zinc-400" />
              )}
            </div>
          </div>
          <p className="text-[13px] font-semibold text-white truncate">{post.display_name}</p>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-zinc-600">
            {formatTimeAgo(post.created_at)}
          </span>
          {isOwner && (onUpdatePrivacy || onDeletePost) && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="p-1 text-zinc-600 hover:text-white transition-colors"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 py-1 animate-in-fade">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdatePrivacy(post.id, { allow_comments: !post.allow_comments });
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-800 transition-colors"
                  >
                    {post.allow_comments !== false
                      ? <MessageCircleOff size={16} className="text-zinc-400 shrink-0" />
                      : <MessageCircle size={16} className="text-green-400 shrink-0" />}
                    <span className="text-xs text-zinc-300">
                      {post.allow_comments !== false ? 'Desativar comentários' : 'Ativar comentários'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdatePrivacy(post.id, { hide_likes_count: !post.hide_likes_count });
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-800 transition-colors"
                  >
                    {post.hide_likes_count
                      ? <Eye size={16} className="text-green-400 shrink-0" />
                      : <EyeOff size={16} className="text-zinc-400 shrink-0" />}
                    <span className="text-xs text-zinc-300">
                      {post.hide_likes_count ? 'Mostrar curtidas' : 'Ocultar curtidas'}
                    </span>
                  </button>
                  {onDeletePost && (
                    <>
                      <div className="border-t border-zinc-700/50 my-1" />
                      <button
                        type="button"
                        onClick={async () => {
                          setMenuOpen(false);
                          if (confirm('Tem certeza que deseja excluir este post? Esta ação não pode ser desfeita.')) {
                            const ok = await onDeletePost(post.id);
                            if (!ok) console.warn('FitRank: exclusão do post falhou', post.id);
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={16} className="text-red-400 shrink-0" />
                        <span className="text-xs text-red-400">Excluir post</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div onDoubleClick={handleDoubleTap} className="relative cursor-pointer">
        {post.foto_url ? (
          <div className="w-full aspect-square bg-zinc-900">
            <img
              src={post.foto_url}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="w-full aspect-square bg-zinc-900/60 flex flex-col items-center justify-center gap-3">
            <TypeIcon className="w-20 h-20 text-zinc-800" />
            <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
              {post.workout_type}
            </span>
          </div>
        )}

        {animating && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Heart className="w-20 h-20 text-white fill-white animate-ping opacity-80" />
          </div>
        )}
      </div>

      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button type="button" onClick={handleLike} className="group -ml-1 p-1">
              <Heart
                className={`w-6 h-6 transition-all ${
                  post.has_liked
                    ? 'text-red-500 fill-red-500 scale-110'
                    : 'text-white group-hover:text-zinc-400'
                } ${animating ? 'scale-125' : ''}`}
              />
            </button>
            {post.allow_comments !== false && (
              <button type="button" onClick={() => onOpenComments?.(post.id)} className="group p-1">
                <MessageCircle className="w-6 h-6 text-white group-hover:text-zinc-400 transition-colors" />
              </button>
            )}
          </div>
          <span className="text-[11px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
            +{post.points_earned ?? 10} PTS
          </span>
        </div>
      </div>

      <div className="px-4 pb-3 space-y-1">
        {(post.likes_count ?? 0) > 0 && !(post.hide_likes_count && currentUserId !== post.user_id) && (
          <button
            type="button"
            onClick={() => onOpenLikes?.(post.id)}
            className="text-[13px] font-semibold text-white hover:text-zinc-300 transition-colors"
          >
            Curtidas
          </button>
        )}
        <p className="text-[13px] text-zinc-300">
          <span
            role={onOpenProfile ? 'button' : undefined}
            tabIndex={onOpenProfile ? 0 : undefined}
            onClick={onOpenProfile ? () => onOpenProfile(post.user_id) : undefined}
            className={`font-semibold text-white ${onOpenProfile ? 'cursor-pointer hover:underline' : ''}`}
          >
            {post.display_name}
          </span>
          {' '}
          <span className="text-zinc-400">{post.caption || post.workout_type}</span>
        </p>
        {post.allow_comments !== false && (post.comments_count ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => onOpenComments?.(post.id)}
            className="text-[13px] text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            Ver {post.comments_count > 1 ? `todos os ${post.comments_count} comentários` : '1 comentário'}
          </button>
        )}
      </div>
    </div>
  );
}
