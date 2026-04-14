import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Hash, Loader2, UserPlus, Users } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { FeedPostCard } from './FeedPostCard.jsx';
import { CommentsDrawer } from './CommentsDrawer.jsx';
import { LikesDrawer } from './LikesDrawer.jsx';
import { ShareDrawer } from './ShareDrawer.jsx';
import { StoriesRing } from './StoriesRing.jsx';
import { FeedSkeleton } from '../ui/Skeleton.jsx';

export function FeedView({
  feed = [],
  feedLoading = false,
  feedHasMore = false,
  feedMode = 'relevant',
  onFeedModeChange,
  onLoadFeed,
  onLoadMoreFeed,
  onRefreshFeed,
  onToggleLike,
  onAddComment,
  onLoadComments,
  onDeleteComment,
  onLoadLikes,
  onOpenFriends,
  onOpenProfile,
  currentUserId,
  onUpdatePrivacy,
  onDeletePost,
  onTrackShare,
  onTrackImpression,
  onMentionClick,
  onHashtagClick,
  trendingHashtags = [],
  onLoadTrendingHashtags,
  storiesRing = [],
  onLoadStoriesRing,
  onOpenStory,
  onCreateStory,
  selfAvatarUrl
}) {
  const [commentsOpen, setCommentsOpen] = useState(null);
  const [likesOpen, setLikesOpen] = useState(null);
  const [sharePost, setSharePost] = useState(null);
  const feedLoaded = useRef(false);
  const listRef = useRef(null);
  const listOffsetRef = useRef(0);

  useEffect(() => {
    if (!feedLoaded.current && onLoadFeed) {
      feedLoaded.current = true;
      onLoadFeed(0);
      onLoadTrendingHashtags?.();
      onLoadStoriesRing?.();
    }
  }, [onLoadFeed, onLoadTrendingHashtags, onLoadStoriesRing]);

  useLayoutEffect(() => {
    listOffsetRef.current = listRef.current?.offsetTop ?? 0;
  });

  const virtualizer = useWindowVirtualizer({
    count: feed.length,
    estimateSize: () => 420,
    overscan: 5,
    scrollMargin: listOffsetRef.current,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= feed.length - 3 && feedHasMore && !feedLoading) {
      onLoadMoreFeed?.();
    }
  }, [virtualItems, feed.length, feedHasMore, feedLoading, onLoadMoreFeed]);

  return (
    <div className="animate-in-fade -mx-4">
      <div className="flex items-center justify-between px-4 mb-4">
        <h2 className="text-lg font-black tracking-tight">Feed</h2>
        <div className="flex items-center gap-2">
          {onFeedModeChange && (
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-full p-0.5">
              <button
                type="button"
                onClick={() => onFeedModeChange('relevant')}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                  feedMode === 'relevant'
                    ? 'bg-green-500 text-black'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Para você
              </button>
              <button
                type="button"
                onClick={() => onFeedModeChange('recent')}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                  feedMode === 'recent'
                    ? 'bg-green-500 text-black'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Recentes
              </button>
            </div>
          )}
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
      </div>

      {(storiesRing.length > 0 || onCreateStory) && (
        <StoriesRing
          stories={storiesRing}
          currentUserId={currentUserId}
          onOpenStory={onOpenStory}
          onCreateStory={onCreateStory}
          selfAvatarUrl={selfAvatarUrl}
        />
      )}

      {trendingHashtags.length > 0 && (
        <div className="flex gap-2 px-4 mb-4 overflow-x-auto scrollbar-hide -mr-4 pr-4">
          {trendingHashtags.map((h) => (
            <button
              key={h.tag}
              type="button"
              onClick={() => onHashtagClick?.(h.tag)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors whitespace-nowrap shrink-0"
            >
              <Hash className="w-3 h-3" />
              {h.tag}
              <span className="text-blue-500/60 ml-0.5">{h.post_count}</span>
            </button>
          ))}
        </div>
      )}

      {feedLoading && feed.length === 0 ? (
        <FeedSkeleton />
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
        <div>
          <div
            ref={listRef}
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualRow) => {
              const post = feed[virtualRow.index];
              return (
                <div
                  key={post.id}
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
                  <FeedPostCard
                    post={post}
                    onToggleLike={onToggleLike}
                    onOpenComments={(id) => setCommentsOpen(id)}
                    onOpenLikes={(id) => setLikesOpen(id)}
                    onOpenProfile={onOpenProfile}
                    currentUserId={currentUserId}
                    onUpdatePrivacy={onUpdatePrivacy}
                    onDeletePost={onDeletePost}
                    onShare={setSharePost}
                    onMentionClick={onMentionClick}
                    onHashtagClick={onHashtagClick}
                    onTrackImpression={onTrackImpression}
                  />
                </div>
              );
            })}
          </div>

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
          allowComments={feed.find((p) => p.id === commentsOpen)?.allow_comments !== false}
        />
      )}

      {likesOpen && (
        <LikesDrawer
          checkinId={likesOpen}
          onClose={() => setLikesOpen(null)}
          onLoadLikes={onLoadLikes}
          onOpenProfile={onOpenProfile}
        />
      )}

      {sharePost && (
        <ShareDrawer
          post={sharePost}
          onClose={() => setSharePost(null)}
          onTrackShare={onTrackShare}
        />
      )}
    </div>
  );
}
