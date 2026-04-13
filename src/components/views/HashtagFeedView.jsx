import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Hash, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { FeedPostCard } from './FeedPostCard.jsx';
import { CommentsDrawer } from './CommentsDrawer.jsx';
import { LikesDrawer } from './LikesDrawer.jsx';
import { ShareDrawer } from './ShareDrawer.jsx';

const PAGE_SIZE = 10;

export function HashtagFeedView({
  tag,
  onBack,
  onToggleLike,
  onAddComment,
  onLoadComments,
  onDeleteComment,
  onLoadLikes,
  onOpenProfile,
  currentUserId,
  onUpdatePrivacy,
  onDeletePost,
  onTrackShare,
  onMentionClick,
  onHashtagClick
}) {
  const { supabase } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const sentinelRef = useRef(null);

  const [commentsOpen, setCommentsOpen] = useState(null);
  const [likesOpen, setLikesOpen] = useState(null);
  const [sharePost, setSharePost] = useState(null);

  const loadPage = useCallback(async (page = 0) => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_hashtag_feed', {
        p_tag: tag,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE
      });
      if (error) {
        console.error('FitRank: hashtag feed', error.message);
        return;
      }
      const rows = (Array.isArray(data) ? data : []).map((r) => ({
        id: r.checkin_id,
        user_id: r.user_id,
        display_name: r.display_name,
        avatar_url: r.avatar_url ?? null,
        date: r.checkin_local_date,
        workout_type: r.tipo_treino,
        foto_url: r.foto_url,
        points_earned: r.points_awarded,
        photo_review_status: r.photo_review_status,
        created_at: r.created_at,
        likes_count: Number(r.likes_count ?? 0),
        comments_count: Number(r.comments_count ?? 0),
        has_liked: r.has_liked ?? false,
        caption: r.feed_caption ?? null,
        allow_comments: r.allow_comments ?? true,
        hide_likes_count: r.hide_likes_count ?? false,
        mentioned_usernames: r.mentioned_usernames ?? []
      }));
      if (page === 0) setPosts(rows);
      else setPosts((prev) => [...prev, ...rows]);
      setHasMore(rows.length >= PAGE_SIZE);
      pageRef.current = page;
    } finally {
      setLoading(false);
    }
  }, [supabase, tag]);

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading) {
          loadPage(pageRef.current + 1);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadPage]);

  return (
    <div className="animate-in-fade -mx-4">
      <div className="flex items-center gap-3 px-4 mb-4">
        <button type="button" onClick={onBack} className="text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1.5">
          <Hash className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-black tracking-tight">{tag}</h2>
        </div>
      </div>

      {loading && posts.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 px-6 space-y-2">
          <Hash className="w-10 h-10 text-zinc-700 mx-auto" />
          <p className="text-sm text-zinc-500">Nenhum post com <span className="font-bold text-blue-400">#{tag}</span></p>
        </div>
      ) : (
        <div className="space-y-px">
          {posts.map((post) => (
            <FeedPostCard
              key={post.id}
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
            />
          ))}

          <div ref={sentinelRef} className="h-1" />

          {loading && posts.length > 0 && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 text-green-500 animate-spin" />
            </div>
          )}

          {!hasMore && posts.length > 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-zinc-600">Fim dos resultados para #{tag}</p>
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
          allowComments={posts.find((p) => p.id === commentsOpen)?.allow_comments !== false}
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
