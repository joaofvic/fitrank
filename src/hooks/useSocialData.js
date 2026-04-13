import { useCallback, useRef, useState } from 'react';

const FEED_PAGE_SIZE = 10;

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
  const feedPageRef = useRef(0);

  const loadFeed = useCallback(async (page = 0) => {
    if (!supabase || !userId) return;
    setFeedLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_friend_feed', {
        p_limit: FEED_PAGE_SIZE,
        p_offset: page * FEED_PAGE_SIZE
      });
      if (error) {
        console.error('FitRank: feed', error.message);
        return;
      }
      const raw = Array.isArray(data) ? data : [];
      const rows = raw.map((r) => ({
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
        hide_likes_count: r.hide_likes_count ?? false
      }));
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
  }, [supabase, userId]);

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
      } else {
        const { error } = await supabase
          .from('likes')
          .insert({ user_id: userId, checkin_id: checkinId, tenant_id: tenantId });
        if (error) throw error;
      }
    } catch (err) {
      console.error('FitRank: toggleLike', err.message);
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
      console.error('FitRank: addComment', error.message);
      setFeed((prev) =>
        prev.map((item) =>
          item.id === checkinId
            ? { ...item, comments_count: Math.max(0, item.comments_count - 1) }
            : item
        )
      );
      return null;
    }

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
      console.error('FitRank: loadComments', error.message);
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
      console.error('FitRank: loadLikes', error.message);
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
      console.error('FitRank: deleteComment', error.message);
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
        console.error('FitRank: loadFriends', error.message);
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
      console.error('FitRank: loadPendingRequests', error.message);
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
      console.error('FitRank: loadSentRequests', error.message);
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
      console.error('FitRank: searchUsers', error.message);
      return [];
    }
    const raw = Array.isArray(data) ? data : [];
    return raw.map((r) => ({
      id: r.user_id,
      display_name: r.display_name,
      friendship_status: r.friendship_status
    }));
  }, [supabase, userId]);

  const sendFriendRequest = useCallback(async (addresseeId) => {
    if (!supabase || !userId || !tenantId) return false;
    const { error } = await supabase
      .from('friendships')
      .insert({
        requester_id: userId,
        addressee_id: addresseeId,
        tenant_id: tenantId,
        status: 'pending'
      });

    if (error) {
      console.error('FitRank: sendFriendRequest', error.message);
      return false;
    }
    await loadSentRequests();
    return true;
  }, [supabase, userId, tenantId, loadSentRequests]);

  const acceptFriendRequest = useCallback(async (friendshipId) => {
    if (!supabase || !userId) return false;
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId)
      .eq('addressee_id', userId);

    if (error) {
      console.error('FitRank: acceptFriendRequest', error.message);
      return false;
    }

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
      console.error('FitRank: declineFriendRequest', error.message);
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
      console.error('FitRank: removeFriend', error.message);
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
      console.error('FitRank: updatePostPrivacy', error.message);
      return false;
    }

    setFeed((prev) =>
      prev.map((item) => (item.id === checkinId ? { ...item, ...allowed } : item))
    );
    return true;
  }, [supabase, userId]);

  const deletePost = useCallback(async (checkinId) => {
    if (!supabase || !userId) return false;

    const { data, error } = await supabase
      .from('checkins')
      .delete()
      .eq('id', checkinId)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      console.error('FitRank: deletePost', error.message);
      return false;
    }

    if (!data || data.length === 0) {
      console.warn('FitRank: deletePost — nenhum registro excluído (RLS ou id inválido)', { checkinId, userId });
      return false;
    }

    setFeed((prev) => prev.filter((item) => item.id !== checkinId));
    return true;
  }, [supabase, userId]);

  return {
    feed,
    feedLoading,
    feedHasMore,
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
    friends,
    friendsLoading,
    pendingRequests,
    sentRequests,
    loadFriends,
    loadPendingRequests,
    loadSentRequests,
    searchUsers,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend
  };
}
