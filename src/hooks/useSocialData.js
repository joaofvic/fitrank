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
      const rows = Array.isArray(data) ? data : [];
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
        item.checkin_id === checkinId
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
          item.checkin_id === checkinId
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

  // --- Comments ---
  const addComment = useCallback(async (checkinId, content) => {
    if (!supabase || !userId || !tenantId) return null;
    const trimmed = (content ?? '').trim();
    if (!trimmed) return null;

    setFeed((prev) =>
      prev.map((item) =>
        item.checkin_id === checkinId
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
          item.checkin_id === checkinId
            ? { ...item, comments_count: Math.max(0, item.comments_count - 1) }
            : item
        )
      );
      return null;
    }

    return {
      ...data,
      user_id: userId,
      display_name: profile?.display_name ?? 'Você'
    };
  }, [supabase, userId, tenantId, profile?.display_name]);

  const loadComments = useCallback(async (checkinId) => {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('comments')
      .select('id, user_id, content, created_at, profiles:user_id ( display_name )')
      .eq('checkin_id', checkinId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      console.error('FitRank: loadComments', error.message);
      return [];
    }

    return (data ?? []).map((c) => ({
      id: c.id,
      user_id: c.user_id,
      content: c.content,
      created_at: c.created_at,
      display_name: c.profiles?.display_name ?? 'Usuário'
    }));
  }, [supabase, tenantId]);

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
          item.checkin_id === checkinId
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
        .select(`
          id, requester_id, addressee_id, created_at,
          requester:requester_id ( id, display_name ),
          addressee:addressee_id ( id, display_name )
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      if (error) {
        console.error('FitRank: loadFriends', error.message);
        return;
      }

      setFriends(
        (data ?? []).map((f) => {
          const isRequester = f.requester_id === userId;
          const friend = isRequester ? f.addressee : f.requester;
          return {
            friendship_id: f.id,
            user_id: friend?.id,
            display_name: friend?.display_name ?? 'Usuário',
            created_at: f.created_at
          };
        })
      );
    } finally {
      setFriendsLoading(false);
    }
  }, [supabase, userId, tenantId]);

  const loadPendingRequests = useCallback(async () => {
    if (!supabase || !userId || !tenantId) return;
    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id, requester_id, created_at,
        requester:requester_id ( id, display_name )
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .eq('addressee_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('FitRank: loadPendingRequests', error.message);
      return;
    }

    setPendingRequests(
      (data ?? []).map((f) => ({
        friendship_id: f.id,
        user_id: f.requester?.id ?? f.requester_id,
        display_name: f.requester?.display_name ?? 'Usuário',
        created_at: f.created_at
      }))
    );
  }, [supabase, userId, tenantId]);

  const loadSentRequests = useCallback(async () => {
    if (!supabase || !userId || !tenantId) return;
    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id, addressee_id, created_at,
        addressee:addressee_id ( id, display_name )
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .eq('requester_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('FitRank: loadSentRequests', error.message);
      return;
    }

    setSentRequests(
      (data ?? []).map((f) => ({
        friendship_id: f.id,
        user_id: f.addressee?.id ?? f.addressee_id,
        display_name: f.addressee?.display_name ?? 'Usuário',
        created_at: f.created_at
      }))
    );
  }, [supabase, userId, tenantId]);

  const searchUsers = useCallback(async (query) => {
    if (!supabase || !userId || !query?.trim()) return [];
    const { data, error } = await supabase.rpc('search_users_for_friendship', {
      p_query: query.trim()
    });
    if (error) {
      console.error('FitRank: searchUsers', error.message);
      return [];
    }
    return Array.isArray(data) ? data : [];
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
    deleteComment,
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
