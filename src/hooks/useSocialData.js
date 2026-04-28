import { useCallback, useRef, useState } from 'react';
import { analytics } from '../lib/analytics.js';
import { haptic } from '../lib/haptics.js';
import { logger } from '../lib/logger.js';

const FEED_PAGE_SIZE = 10;

function getVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve(Math.round(video.duration * 1000));
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => resolve(5000);
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Hook de dados sociais: feed de amigos, amizades, curtidas e comentários.
 */
export function useSocialData({ supabase, session, profile }) {
  const userId = session?.user?.id ?? null;
  const tenantId = profile?.tenant_id ?? null;

  // --- Feed ---
  const [feed, setFeed] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedMode, setFeedModeRaw] = useState('relevant');
  const feedPageRef = useRef(0);

  const mapFeedRow = (r) => ({
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
  });

  const loadFeed = useCallback(async (page = 0, modeOverride) => {
    if (!supabase || !userId) return;
    setFeedLoading(true);
    try {
      const mode = modeOverride ?? feedMode;
      const rpcName = mode === 'relevant' ? 'get_relevant_feed' : 'get_friend_feed';
      const { data, error } = await supabase.rpc(rpcName, {
        p_limit: FEED_PAGE_SIZE,
        p_offset: page * FEED_PAGE_SIZE
      });
      if (error) {
        logger.error('feed', error);
        return;
      }
      const rows = (Array.isArray(data) ? data : []).map(mapFeedRow);
      if (page === 0) {
        setFeed(rows);
      } else {
        setFeed((prev) => [...prev, ...rows]);
      }
      setFeedHasMore(rows.length >= FEED_PAGE_SIZE);
      feedPageRef.current = page;
    } finally {
      setFeedLoading(false);
    }
  }, [supabase, userId, feedMode]);

  const setFeedMode = useCallback((mode) => {
    setFeedModeRaw(mode);
    setFeed([]);
    setFeedHasMore(true);
    feedPageRef.current = 0;
    if (supabase && userId) {
      loadFeed(0, mode);
    }
  }, [supabase, userId, loadFeed]);

  const refreshFeed = useCallback(() => {
    feedPageRef.current = 0;
    setFeedHasMore(true);
    return loadFeed(0);
  }, [loadFeed]);

  const loadMoreFeed = useCallback(() => {
    if (feedLoading || !feedHasMore) return;
    return loadFeed(feedPageRef.current + 1);
  }, [feedLoading, feedHasMore, loadFeed]);

  // --- Like (optimistic) ---
  const toggleLike = useCallback(async (checkinId, currentlyLiked) => {
    if (!supabase || !userId || !tenantId) return;

    if (!currentlyLiked) haptic('light');

    setFeed((prev) =>
      prev.map((item) =>
        item.id === checkinId
          ? {
              ...item,
              has_liked: !currentlyLiked,
              likes_count: item.likes_count + (currentlyLiked ? -1 : 1)
            }
          : item
      )
    );

    try {
      if (currentlyLiked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', userId)
          .eq('checkin_id', checkinId);
        if (error) throw error;
        analytics.socialUnlike(checkinId);
      } else {
        const { error } = await supabase
          .from('likes')
          .insert({ user_id: userId, checkin_id: checkinId, tenant_id: tenantId });
        if (error) throw error;
        analytics.socialLike(checkinId);
      }
    } catch (err) {
      logger.error('toggleLike', err);
      setFeed((prev) =>
        prev.map((item) =>
          item.id === checkinId
            ? {
                ...item,
                has_liked: currentlyLiked,
                likes_count: item.likes_count + (currentlyLiked ? 1 : -1)
              }
            : item
        )
      );
    }
  }, [supabase, userId, tenantId]);

  // --- Profile name resolver (used by comments & friendships) ---
  const fetchProfileNames = useCallback(async (userIds) => {
    if (!supabase || userIds.length === 0) return {};
    const unique = [...new Set(userIds)];
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, username')
      .in('id', unique);
    const map = {};
    for (const p of data ?? []) map[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url, username: p.username };
    return map;
  }, [supabase]);

  // --- Comments ---
  const addComment = useCallback(async (checkinId, content) => {
    if (!supabase || !userId || !tenantId) return null;
    const trimmed = (content ?? '').trim();
    if (!trimmed) return null;

    setFeed((prev) =>
      prev.map((item) =>
        item.id === checkinId
          ? { ...item, comments_count: item.comments_count + 1 }
          : item
      )
    );

    const { data, error } = await supabase
      .from('comments')
      .insert({
        user_id: userId,
        checkin_id: checkinId,
        tenant_id: tenantId,
        content: trimmed
      })
      .select('id, content, created_at')
      .single();

    if (error) {
      logger.error('addComment', error);
      setFeed((prev) =>
        prev.map((item) =>
          item.id === checkinId
            ? { ...item, comments_count: Math.max(0, item.comments_count - 1) }
            : item
        )
      );
      return null;
    }

    analytics.socialCommentAdded(checkinId);

    return {
      ...data,
      user_id: userId,
      display_name: profile?.display_name ?? 'Você',
      avatar_url: profile?.avatar_url ?? null
    };
  }, [supabase, userId, tenantId, profile?.display_name, profile?.avatar_url]);

  const loadComments = useCallback(async (checkinId) => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('comments')
      .select('id, user_id, content, created_at')
      .eq('checkin_id', checkinId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      logger.error('loadComments', error);
      return [];
    }

    const rows = data ?? [];
    const names = await fetchProfileNames(rows.map((c) => c.user_id));

    return rows.map((c) => ({
      id: c.id,
      user_id: c.user_id,
      content: c.content,
      created_at: c.created_at,
      display_name: names[c.user_id]?.display_name ?? 'Usuário',
      avatar_url: names[c.user_id]?.avatar_url ?? null
    }));
  }, [supabase, tenantId, fetchProfileNames]);

  const loadLikes = useCallback(async (checkinId) => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('likes')
      .select('user_id, created_at')
      .eq('checkin_id', checkinId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      logger.error('loadLikes', error);
      return [];
    }

    const rows = data ?? [];
    const names = await fetchProfileNames(rows.map((l) => l.user_id));

    return rows.map((l) => ({
      user_id: l.user_id,
      created_at: l.created_at,
      display_name: names[l.user_id]?.display_name ?? 'Usuário',
      avatar_url: names[l.user_id]?.avatar_url ?? null
    }));
  }, [supabase, fetchProfileNames]);

  const deleteComment = useCallback(async (commentId, checkinId) => {
    if (!supabase || !userId) return false;
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId);

    if (error) {
      logger.error('deleteComment', error);
      return false;
    }

    if (checkinId) {
      setFeed((prev) =>
        prev.map((item) =>
          item.id === checkinId
            ? { ...item, comments_count: Math.max(0, item.comments_count - 1) }
            : item
        )
      );
    }
    return true;
  }, [supabase, userId]);

  // --- Friendships ---
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);

  const loadFriends = useCallback(async () => {
    if (!supabase || !userId || !tenantId) return;
    setFriendsLoading(true);
    try {
      const { data, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, created_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      if (error) {
        logger.error('loadFriends', error);
        return;
      }

      const rows = data ?? [];
      const friendIds = rows.map((f) => f.requester_id === userId ? f.addressee_id : f.requester_id);
      const names = await fetchProfileNames(friendIds);

      setFriends(
        rows.map((f) => {
          const friendId = f.requester_id === userId ? f.addressee_id : f.requester_id;
          return {
            id: f.id,
            user_id: friendId,
            display_name: names[friendId]?.display_name ?? 'Usuário',
            avatar_url: names[friendId]?.avatar_url ?? null,
            username: names[friendId]?.username ?? null,
            created_at: f.created_at
          };
        })
      );
    } finally {
      setFriendsLoading(false);
    }
  }, [supabase, userId, tenantId, fetchProfileNames]);

  const loadPendingRequests = useCallback(async () => {
    if (!supabase || !userId || !tenantId) return;
    const { data, error } = await supabase
      .from('friendships')
      .select('id, requester_id, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .eq('addressee_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('loadPendingRequests', error);
      return;
    }

    const rows = data ?? [];
    const names = await fetchProfileNames(rows.map((f) => f.requester_id));

    setPendingRequests(
      rows.map((f) => ({
        id: f.id,
        user_id: f.requester_id,
        display_name: names[f.requester_id]?.display_name ?? 'Usuário',
        avatar_url: names[f.requester_id]?.avatar_url ?? null,
        created_at: f.created_at
      }))
    );
  }, [supabase, userId, tenantId, fetchProfileNames]);

  const loadSentRequests = useCallback(async () => {
    if (!supabase || !userId || !tenantId) return;
    const { data, error } = await supabase
      .from('friendships')
      .select('id, addressee_id, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .eq('requester_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('loadSentRequests', error);
      return;
    }

    const rows = data ?? [];
    const names = await fetchProfileNames(rows.map((f) => f.addressee_id));

    setSentRequests(
      rows.map((f) => ({
        id: f.id,
        addressee_id: f.addressee_id,
        display_name: names[f.addressee_id]?.display_name ?? 'Usuário',
        avatar_url: names[f.addressee_id]?.avatar_url ?? null,
        created_at: f.created_at
      }))
    );
  }, [supabase, userId, tenantId, fetchProfileNames]);

  const searchUsers = useCallback(async (query) => {
    if (!supabase || !userId || !query?.trim()) return [];
    const { data, error } = await supabase.rpc('search_users_for_friendship', {
      p_query: query.trim()
    });
    if (error) {
      logger.error('searchUsers', error);
      return [];
    }
    const raw = Array.isArray(data) ? data : [];
    return raw.map((r) => ({
      id: r.user_id,
      display_name: r.display_name,
      friendship_status: r.friendship_status,
      avatar_url: r.avatar_url ?? null
    }));
  }, [supabase, userId]);

  /**
   * @returns {Promise<{ ok: boolean, friendshipId?: string }>}
   */
  const sendFriendRequest = useCallback(async (addresseeId) => {
    if (!supabase || !userId || !tenantId) return { ok: false };
    const { data, error } = await supabase
      .from('friendships')
      .insert({
        requester_id: userId,
        addressee_id: addresseeId,
        tenant_id: tenantId,
        status: 'pending'
      })
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('sendFriendRequest', error);
      return { ok: false };
    }
    analytics.socialFriendRequestSent();
    await loadSentRequests();
    const friendshipId = data?.id != null ? String(data.id) : undefined;
    return { ok: true, friendshipId };
  }, [supabase, userId, tenantId, loadSentRequests]);

  /**
   * Cancela pedido **enviado** por mim ainda pendente (delete; distinto de removeFriend em amizade aceite).
   * @returns {Promise<boolean>}
   */
  const cancelSentFriendRequest = useCallback(async (friendshipId) => {
    if (!supabase || !userId || !friendshipId) return false;
    const { data, error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId)
      .eq('requester_id', userId)
      .eq('status', 'pending')
      .select('id');

    if (error) {
      logger.error('cancelSentFriendRequest', error);
      return false;
    }
    if (!data?.length) {
      /* Epic E corrida: o outro lado pode ter aceito/recusado — delete pendente não remove linhas. */
      logger.warn('cancelSentFriendRequest — nenhuma linha removida', { friendshipId, userId });
      await loadSentRequests();
      return false;
    }
    analytics.socialFriendRequestCancelled();
    await loadSentRequests();
    return true;
  }, [supabase, userId, loadSentRequests]);

  const acceptFriendRequest = useCallback(async (friendshipId) => {
    if (!supabase || !userId) return false;
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId)
      .eq('addressee_id', userId);

    if (error) {
      logger.error('acceptFriendRequest', error);
      return false;
    }

    analytics.socialFriendAccepted();
    await Promise.all([loadFriends(), loadPendingRequests()]);
    return true;
  }, [supabase, userId, loadFriends, loadPendingRequests]);

  const declineFriendRequest = useCallback(async (friendshipId) => {
    if (!supabase || !userId) return false;
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'declined' })
      .eq('id', friendshipId)
      .eq('addressee_id', userId);

    if (error) {
      logger.error('declineFriendRequest', error);
      return false;
    }

    await loadPendingRequests();
    return true;
  }, [supabase, userId, loadPendingRequests]);

  const removeFriend = useCallback(async (friendshipId) => {
    if (!supabase || !userId) return false;
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (error) {
      logger.error('removeFriend', error);
      return false;
    }

    await loadFriends();
    return true;
  }, [supabase, userId, loadFriends]);

  const updatePostPrivacy = useCallback(async (checkinId, fields) => {
    if (!supabase || !userId) return false;
    const allowed = {};
    if (fields.allow_comments !== undefined) allowed.allow_comments = fields.allow_comments;
    if (fields.hide_likes_count !== undefined) allowed.hide_likes_count = fields.hide_likes_count;
    if (Object.keys(allowed).length === 0) return false;

    const { error } = await supabase
      .from('checkins')
      .update(allowed)
      .eq('id', checkinId)
      .eq('user_id', userId);

    if (error) {
      logger.error('updatePostPrivacy', error);
      return false;
    }

    setFeed((prev) =>
      prev.map((item) => (item.id === checkinId ? { ...item, ...allowed } : item))
    );
    return true;
  }, [supabase, userId]);

  const resolveUsername = useCallback(async (username) => {
    if (!supabase || !username) return null;
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();
    return data?.id ?? null;
  }, [supabase, tenantId]);

  const trackShare = useCallback(async (checkinId, platform) => {
    if (!supabase || !userId || !tenantId) return;
    try {
      const { error } = await supabase
        .from('shares')
        .insert({ user_id: userId, checkin_id: checkinId, tenant_id: tenantId, platform });
      if (!error) analytics.socialShare(platform);
    } catch (err) {
      logger.error('trackShare', err);
    }
  }, [supabase, userId, tenantId]);

  // --- Trending Hashtags ---
  const [trendingHashtags, setTrendingHashtags] = useState([]);

  const loadTrendingHashtags = useCallback(async () => {
    if (!supabase || !userId) return;
    try {
      const { data, error } = await supabase.rpc('get_trending_hashtags', { p_limit: 10 });
      if (error) {
        logger.error('trending hashtags', error);
        return;
      }
      setTrendingHashtags(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('trending hashtags', err);
    }
  }, [supabase, userId]);

  // --- Post Impressions ---
  const trackImpression = useCallback(async (checkinId, durationMs) => {
    if (!supabase || !userId || !tenantId || !checkinId) return;
    try {
      await supabase.from('post_impressions').insert({
        user_id: userId,
        checkin_id: checkinId,
        tenant_id: tenantId,
        view_duration_ms: Math.round(durationMs)
      });
    } catch (err) {
      logger.error('trackImpression', err);
    }
  }, [supabase, userId, tenantId]);

  // --- Badges ---
  const [badges, setBadges] = useState([]);
  const [badgesLoading, setBadgesLoading] = useState(false);

  const loadBadges = useCallback(async (targetUserId) => {
    if (!supabase) return [];
    const uid = targetUserId ?? userId;
    if (!uid) return [];
    setBadgesLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_user_badges', { p_user_id: uid });
      if (error) {
        logger.error('loadBadges', error);
        return [];
      }
      const rows = Array.isArray(data) ? data : [];
      if (!targetUserId || targetUserId === userId) {
        setBadges(rows);
      }
      return rows;
    } finally {
      setBadgesLoading(false);
    }
  }, [supabase, userId]);

  // --- Stories ---
  const [storiesRing, setStoriesRing] = useState([]);
  const [storiesRingLoading, setStoriesRingLoading] = useState(false);

  const loadStoriesRing = useCallback(async () => {
    if (!supabase || !userId) return;
    setStoriesRingLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_stories_ring', { p_limit: 20 });
      if (error) {
        logger.error('stories ring', error);
        return;
      }
      setStoriesRing(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('stories ring', err);
    } finally {
      setStoriesRingLoading(false);
    }
  }, [supabase, userId]);

  const loadUserStories = useCallback(async (targetUserId) => {
    if (!supabase || !userId) return [];
    const { data, error } = await supabase.rpc('get_user_stories', { p_user_id: targetUserId });
    if (error) {
      logger.error('user stories', error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  }, [supabase, userId]);

  const createStory = useCallback(async (file, caption = '') => {
    if (!supabase || !userId || !tenantId || !file) return null;
    const isVideo = file.type?.startsWith('video/');
    const ext = file.name?.split('.').pop()?.toLowerCase() || (isVideo ? 'mp4' : 'jpg');
    const storagePath = `${userId}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage.from('stories').upload(storagePath, file, {
      upsert: false,
      contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg')
    });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from('stories').getPublicUrl(storagePath);
    const mediaUrl = pub.publicUrl;

    let durationMs = 5000;
    if (isVideo) {
      durationMs = Math.min(15000, await getVideoDuration(file));
    }

    const { data, error } = await supabase
      .from('stories')
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        media_url: mediaUrl,
        media_type: isVideo ? 'video' : 'photo',
        duration_ms: durationMs,
        caption: caption?.trim() || null
      })
      .select('id')
      .single();

    if (error) throw error;
    analytics.socialStoryCreated();
    await loadStoriesRing();
    return data.id;
  }, [supabase, userId, tenantId, loadStoriesRing]);

  const markStoryViewed = useCallback(async (storyId) => {
    if (!supabase || !userId) return;
    try {
      const { error } = await supabase.from('story_views').insert({
        story_id: storyId,
        viewer_id: userId
      });
      if (!error) analytics.socialStoryViewed(userId);
    } catch (_) {
      // ignore duplicates
    }
  }, [supabase, userId]);

  const loadStoryViewers = useCallback(async (storyId) => {
    if (!supabase || !userId) return [];
    const { data, error } = await supabase.rpc('get_story_viewers', { p_story_id: storyId });
    if (error) {
      logger.error('story viewers', error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  }, [supabase, userId]);

  const deleteStory = useCallback(async (storyId) => {
    if (!supabase || !userId) return false;
    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', storyId)
      .eq('user_id', userId);
    if (error) {
      logger.error('deleteStory', error);
      return false;
    }
    await loadStoriesRing();
    return true;
  }, [supabase, userId, loadStoriesRing]);

  const deletePost = useCallback(async (checkinId) => {
    if (!supabase || !userId) return false;

    const { data, error } = await supabase
      .from('checkins')
      .delete()
      .eq('id', checkinId)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      logger.error('deletePost', error);
      return false;
    }

    if (!data || data.length === 0) {
      logger.warn('deletePost — nenhum registro excluído (RLS ou id inválido)', { checkinId, userId });
      return false;
    }

    setFeed((prev) => prev.filter((item) => item.id !== checkinId));
    return true;
  }, [supabase, userId]);

  return {
    feed,
    feedLoading,
    feedHasMore,
    feedMode,
    setFeedMode,
    loadFeed,
    loadMoreFeed,
    refreshFeed,
    toggleLike,
    addComment,
    loadComments,
    loadLikes,
    deleteComment,
    updatePostPrivacy,
    deletePost,
    trackShare,
    trackImpression,
    resolveUsername,
    friends,
    friendsLoading,
    pendingRequests,
    sentRequests,
    loadFriends,
    loadPendingRequests,
    loadSentRequests,
    searchUsers,
    sendFriendRequest,
    cancelSentFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    trendingHashtags,
    loadTrendingHashtags,
    badges,
    badgesLoading,
    loadBadges,
    storiesRing,
    storiesRingLoading,
    loadStoriesRing,
    loadUserStories,
    createStory,
    markStoryViewed,
    loadStoryViewers,
    deleteStory
  };
}
