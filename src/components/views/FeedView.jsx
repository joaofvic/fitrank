import { useEffect, useRef, useState } from 'react';
import { Loader2, UserPlus, Users } from 'lucide-react';
import { FeedPostCard } from './FeedPostCard.jsx';
import { CommentsDrawer } from './CommentsDrawer.jsx';

export function FeedView({
  feed = [],
  feedLoading = false,
  feedHasMore = false,
  onLoadFeed,
  onLoadMoreFeed,
  onRefreshFeed,
  onToggleLike,
  onAddComment,
  onLoadComments,
  onDeleteComment,
  onOpenFriends,
  currentUserId
}) {
  const [commentsOpen, setCommentsOpen] = useState(null);
  const feedLoaded = useRef(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!feedLoaded.current && onLoadFeed) {
      feedLoaded.current = true;
      onLoadFeed(0);
    }
  }, [onLoadFeed]);

  useEffect(() => {
    if (!sentinelRef.current || !onLoadMoreFeed || !feedHasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && feedHasMore && !feedLoading) {
          onLoadMoreFeed();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMoreFeed, feedHasMore, feedLoading]);

  return (
    <div className="animate-in-fade -mx-4">
      <div className="flex items-center justify-between px-4 mb-4">
        <h2 className="text-lg font-black tracking-tight">Feed</h2>
        {onOpenFriends && (
          <button
            type="button"
            onClick={onOpenFriends}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white hover:border-zinc-700 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Amigos
          </button>
        )}
      </div>

      {feedLoading && feed.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
        </div>
      ) : feed.length === 0 ? (
        <div className="text-center py-16 px-6 space-y-3">
          <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-zinc-700" />
          </div>
          <p className="text-sm font-semibold text-zinc-400">Seu feed está vazio</p>
          <p className="text-xs text-zinc-600 max-w-[220px] mx-auto">
            Adicione amigos para ver os treinos deles aqui!
          </p>
          {onOpenFriends && (
            <button
              type="button"
              onClick={onOpenFriends}
              className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold bg-green-500 text-black active:scale-95 transition-transform"
            >
              <UserPlus className="w-4 h-4" />
              Buscar amigos
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-px">
          {feed.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              onToggleLike={onToggleLike}
              onOpenComments={(id) => setCommentsOpen(id)}
            />
          ))}

          <div ref={sentinelRef} className="h-1" />

          {feedLoading && feed.length > 0 && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
            </div>
          )}

          {!feedHasMore && feed.length > 0 && (
            <div className="text-center py-8 space-y-1">
              <p className="text-xs text-zinc-600">Você está atualizado</p>
              <p className="text-[10px] text-zinc-700">Você viu todos os treinos recentes.</p>
            </div>
          )}
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
        />
      )}
    </div>
  );
}
