import { useState } from 'react';
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Send, User } from 'lucide-react';
import { formatTimeAgo } from '../../lib/dates.js';
import { workoutTypeIcon } from '../../lib/workout-icons.js';

export function FeedPostCard({ post, onToggleLike, onOpenComments }) {
  const [animating, setAnimating] = useState(false);

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
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500/30 to-zinc-800 p-[2px]">
          <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-zinc-400" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white truncate">{post.display_name}</p>
        </div>
        <span className="text-[11px] text-zinc-600 shrink-0">
          {formatTimeAgo(post.created_at)}
        </span>
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
            <button type="button" onClick={() => onOpenComments?.(post.id)} className="group p-1">
              <MessageCircle className="w-6 h-6 text-white group-hover:text-zinc-400 transition-colors" />
            </button>
            <button type="button" className="group p-1">
              <Send className="w-[22px] h-[22px] text-white group-hover:text-zinc-400 transition-colors -rotate-[20deg]" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
              +{post.points_earned ?? 10} PTS
            </span>
            <button type="button" className="group p-1">
              <Bookmark className="w-6 h-6 text-white group-hover:text-zinc-400 transition-colors" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pb-3 space-y-1">
        {(post.likes_count ?? 0) > 0 && (
          <p className="text-[13px] font-semibold text-white">
            {post.likes_count} curtida{post.likes_count !== 1 ? 's' : ''}
          </p>
        )}
        <p className="text-[13px] text-zinc-300">
          <span className="font-semibold text-white">{post.display_name}</span>
          {' '}
          <span className="text-zinc-400">{post.caption || post.workout_type}</span>
        </p>
        {(post.comments_count ?? 0) > 0 && (
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
