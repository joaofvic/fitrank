import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  leaderboardDateRangeForPeriod,
  rankingPeriodRangeLabel,
  todayLocalISODate
} from '../lib/dates.js';
import { extractMentions } from '../lib/mention-parser.js';
import { extractHashtags } from '../lib/hashtag-parser.js';

/**
 * Dados FitRank na nuvem (ranking, check-ins, realtime leve).
 */
export function useFitCloudData({ supabase, session, profile, refreshProfile }) {
  const userId = session?.user?.id ?? null;
  const tenantId = profile?.tenant_id ?? null;

  const [rankingPeriod, setRankingPeriod] = useState('month');
  const { start: rankingStart, end: rankingEnd } = useMemo(
    () => leaderboardDateRangeForPeriod(rankingPeriod),
    [rankingPeriod]
  );
  const rankingPeriodLabel = useMemo(
    () => rankingPeriodRangeLabel(rankingPeriod, rankingStart, rankingEnd),
    [rankingPeriod, rankingStart, rankingEnd]
  );

  const [leaderboard, setLeaderboard] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [readNotifications, setReadNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [error, setError] = useState(null);

  const [checkinPage, setCheckinPage] = useState(0);
  const [checkinLimit, setCheckinLimit] = useState(10);
  const [checkinCount, setCheckinCount] = useState(0);
  const [checkinApprovedCount, setCheckinApprovedCount] = useState(0);
  const [checkinsLoading, setCheckinsLoading] = useState(false);

  const refreshLeaderboard = useCallback(async () => {
    if (!supabase || !userId) return;
    setLeaderboardLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_tenant_leaderboard_period', {
        p_start: rankingStart,
        p_end: rankingEnd,
        p_period: rankingPeriod
      });
      if (rpcError) {
        console.error('FitRank: ranking', rpcError.message);
        return;
      }
      const rows = Array.isArray(data) ? data : [];
      setLeaderboard(
        rows.map((r) => ({
          uid: r.id,
          nome: r.nome_exibicao,
          pontos: r.pontos,
          streak: r.streak,
          is_pro: r.is_pro,
          academia: r.academia || '',
          avatar_url: r.avatar_url || null
        }))
      );
    } finally {
      setLeaderboardLoading(false);
    }
  }, [supabase, userId, rankingStart, rankingEnd, rankingPeriod]);

  const refreshCheckins = useCallback(async () => {
    if (!supabase || !userId) return;
    setCheckinsLoading(true);
    try {
      const from = checkinPage * checkinLimit;
      const to = from + checkinLimit - 1;

      const [pageResult, countResult] = await Promise.all([
        supabase
          .from('checkins')
          .select(
            'id, checkin_local_date, tipo_treino, points_awarded, foto_url, photo_review_status, photo_rejection_reason_code, photo_rejection_note',
            { count: 'exact' }
          )
          .eq('user_id', userId)
          .order('checkin_local_date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, to),
        supabase
          .from('checkins')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .neq('photo_review_status', 'rejected')
      ]);

      if (pageResult.error) {
        console.error('FitRank: checkins', pageResult.error.message);
        return;
      }

      setCheckinCount(pageResult.count ?? 0);
      setCheckinApprovedCount(countResult.count ?? 0);
      setCheckins(
        (pageResult.data ?? []).map((c) => ({
          id: c.id,
          date: c.checkin_local_date,
          type: c.tipo_treino,
          points_earned: c.photo_review_status === 'rejected' ? 0 : c.points_awarded,
          foto_url: c.foto_url,
          photo_review_status: c.photo_review_status,
          photo_rejection_reason_code: c.photo_rejection_reason_code,
          photo_rejection_note: c.photo_rejection_note
        }))
      );
    } finally {
      setCheckinsLoading(false);
    }
  }, [supabase, userId, checkinPage, checkinLimit]);

  useEffect(() => {
    setCheckinPage(0);
  }, [checkinLimit]);

  const refreshNotifications = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data, error: nErr } = await supabase
      .from('notifications')
      .select('id, type, title, body, data, created_at, read_at')
      .eq('user_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(20);
    if (nErr) {
      console.error('FitRank: notifications', nErr.message);
      return;
    }
    setNotifications(Array.isArray(data) ? data : []);
  }, [supabase, userId]);

  const refreshReadNotifications = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data, error: nErr } = await supabase
      .from('notifications')
      .select('id, type, title, body, data, created_at, read_at')
      .eq('user_id', userId)
      .not('read_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (nErr) {
      console.error('FitRank: readNotifications', nErr.message);
      return;
    }
    setReadNotifications(Array.isArray(data) ? data : []);
  }, [supabase, userId]);

  const markAllNotificationsRead = useCallback(async () => {
    if (!supabase || !userId) return;
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
    await refreshNotifications();
    await refreshReadNotifications();
  }, [supabase, userId, refreshNotifications, refreshReadNotifications]);

  const refreshAll = useCallback(async () => {
    if (!supabase || !userId) return;
    setError(null);
    await Promise.all([refreshLeaderboard(), refreshCheckins(), refreshNotifications(), refreshReadNotifications()]);
    if (refreshProfile) await refreshProfile();
  }, [supabase, userId, refreshLeaderboard, refreshCheckins, refreshNotifications, refreshReadNotifications, refreshProfile]);

  const refreshLeaderboardRef = useRef(refreshLeaderboard);
  refreshLeaderboardRef.current = refreshLeaderboard;
  const refreshCheckinsRef = useRef(refreshCheckins);
  refreshCheckinsRef.current = refreshCheckins;
  const refreshNotificationsRef = useRef(refreshNotifications);
  refreshNotificationsRef.current = refreshNotifications;
  const refreshProfileRef = useRef(refreshProfile);
  refreshProfileRef.current = refreshProfile;

  useEffect(() => {
    if (!supabase || !userId || !tenantId) {
      setLeaderboard([]);
      setCheckins([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      await refreshCheckins();
      await refreshNotifications();
      if (refreshProfile) await refreshProfile();
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, userId, tenantId, refreshCheckins, refreshProfile]);

  useEffect(() => {
    if (!supabase || !userId || !tenantId) return;
    refreshLeaderboard();
  }, [supabase, userId, tenantId, refreshLeaderboard]);

  useEffect(() => {
    if (!supabase || !userId || !tenantId) return;

    const channel = supabase
      .channel(`fitrank-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `tenant_id=eq.${tenantId}` },
        () => {
          refreshLeaderboardRef.current();
          refreshProfileRef.current?.();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'checkins',
          filter: `tenant_id=eq.${tenantId}`
        },
        () => {
          refreshLeaderboardRef.current();
          refreshCheckinsRef.current();
          refreshNotificationsRef.current();
          refreshProfileRef.current?.();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'checkins',
          filter: `tenant_id=eq.${tenantId}`
        },
        () => {
          // rejeição/ajustes podem atualizar pontos/streak e ranking
          refreshLeaderboardRef.current();
          refreshCheckinsRef.current();
          refreshNotificationsRef.current();
          refreshProfileRef.current?.();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('FitRank: Realtime indisponível; use atualização manual ou habilite a publicação no Supabase.');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, tenantId]);

  useEffect(() => {
    if (!supabase || !userId || !tenantId) return;

    // Fallback para ambientes onde Realtime de UPDATE não esteja publicado:
    // mantém pontos/streak/ranking sincronizados após moderação.
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refreshLeaderboardRef.current();
      refreshCheckinsRef.current();
      refreshNotificationsRef.current();
      refreshProfileRef.current?.();
    };

    const id = setInterval(() => tick(), 15_000);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    document.addEventListener?.('visibilitychange', tick);

    // roda 1x ao montar
    tick();

    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener?.('visibilitychange', tick);
    };
  }, [supabase, userId, tenantId]);

  const insertCheckin = useCallback(
    async (tipoTreino, fotoFile = null, feedVisible = true, feedCaption = null) => {
      if (!supabase || !userId || !tenantId) {
        throw new Error('Sessão inválida');
      }
      const today = todayLocalISODate();
      let foto_url = null;

      let exemptTipos = [];
      try {
        const { data: exData } = await supabase.rpc('checkin_photo_exempt_tipos');
        if (Array.isArray(exData)) exemptTipos = exData;
      } catch {
        exemptTipos = [];
      }
      const needsPhoto = !exemptTipos.includes(tipoTreino);

      if (needsPhoto && (!fotoFile || !(fotoFile.size > 0))) {
        throw new Error('Foto obrigatória para registrar o treino.');
      }

      if (fotoFile && fotoFile.size > 0) {
        const safeName = fotoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${tenantId}/${userId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from('checkin-photos').upload(path, fotoFile, {
          upsert: false,
          contentType: fotoFile.type || 'image/jpeg'
        });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('checkin-photos').getPublicUrl(path);
        foto_url = pub.publicUrl;
      }

      const trimmedCaption = feedCaption?.trim() || null;

      const { data: insData, error: insErr } = await supabase.from('checkins').insert({
        user_id: userId,
        tenant_id: tenantId,
        checkin_local_date: today,
        tipo_treino: tipoTreino,
        foto_url,
        feed_visible: feedVisible,
        feed_caption: trimmedCaption
      }).select('id').single();

      if (insErr) {
        if (insErr.code === '23505') {
          const dup = new Error('Você já registrou este tipo de treino hoje.');
          dup.code = '23505';
          throw dup;
        }
        throw insErr;
      }

      if (trimmedCaption && insData?.id) {
        const usernames = extractMentions(trimmedCaption);
        if (usernames.length > 0) {
          await supabase.rpc('save_checkin_mentions', {
            p_checkin_id: insData.id,
            p_usernames: usernames
          }).catch((err) => console.error('FitRank: save mentions', err.message));
        }

        const tags = extractHashtags(trimmedCaption);
        if (tags.length > 0) {
          await supabase.rpc('save_checkin_hashtags', {
            p_checkin_id: insData.id,
            p_tags: tags
          }).catch((err) => console.error('FitRank: save hashtags', err.message));
        }
      }

      setCheckinPage(0);
      await refreshAll();
    },
    [supabase, userId, tenantId, refreshAll]
  );

  const retryCheckin = useCallback(
    async (checkinId, fotoFile) => {
      if (!supabase || !userId || !tenantId) {
        throw new Error('Sessão inválida');
      }
      if (!fotoFile || !(fotoFile.size > 0)) {
        throw new Error('Foto obrigatória para reenviar.');
      }

      const safeName = fotoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${tenantId}/${userId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from('checkin-photos').upload(path, fotoFile, {
        upsert: false,
        contentType: fotoFile.type || 'image/jpeg'
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('checkin-photos').getPublicUrl(path);

      const { error: rpcErr } = await supabase.rpc('retry_rejected_checkin', {
        p_checkin_id: checkinId,
        p_new_foto_url: pub.publicUrl
      });
      if (rpcErr) throw rpcErr;

      setCheckinPage(0);
      await refreshAll();
    },
    [supabase, userId, tenantId, refreshAll]
  );

  const uploadAvatar = useCallback(
    async (file) => {
      if (!supabase || !userId) return null;
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg'
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      return `${pub.publicUrl}?t=${Date.now()}`;
    },
    [supabase, userId]
  );

  const updateProfile = useCallback(
    async (fields) => {
      if (!supabase || !userId) return { error: 'Não autenticado' };
      const allowed = {};
      if (fields.display_name !== undefined) allowed.display_name = fields.display_name;
      if (fields.username !== undefined) allowed.username = fields.username || null;
      if (fields.avatar_url !== undefined) allowed.avatar_url = fields.avatar_url;
      if (Object.keys(allowed).length === 0) return { error: 'Nenhum campo para atualizar' };

      const { error: dbErr } = await supabase
        .from('profiles')
        .update(allowed)
        .eq('id', userId);

      if (dbErr) return { error: dbErr.message };
      await refreshProfile?.();
      return { error: null };
    },
    [supabase, userId, refreshProfile]
  );

  const checkUsernameAvailable = useCallback(
    async (username) => {
      if (!supabase) return false;
      const { data, error: rpcErr } = await supabase.rpc('check_username_available', {
        p_username: username
      });
      if (rpcErr) {
        console.error('FitRank: checkUsername', rpcErr.message);
        return false;
      }
      return data === true;
    },
    [supabase]
  );

  const updatePassword = useCallback(
    async (currentPassword, newPassword) => {
      if (!supabase) return { error: 'Não autenticado' };
      const email = (await supabase.auth.getUser()).data?.user?.email;
      if (!email) return { error: 'E-mail do usuário não encontrado' };

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword
      });
      if (signInErr) return { error: 'A senha atual está incorreta' };

      const { error: authErr } = await supabase.auth.updateUser({ password: newPassword });
      if (authErr) return { error: authErr.message };
      return { error: null };
    },
    [supabase]
  );

  return {
    leaderboard,
    checkins,
    notifications,
    readNotifications,
    loading,
    leaderboardLoading,
    error,
    setError,
    refreshAll,
    refreshLeaderboard,
    refreshCheckins,
    refreshNotifications,
    refreshReadNotifications,
    markAllNotificationsRead,
    insertCheckin,
    retryCheckin,
    rankingPeriod,
    setRankingPeriod,
    rankingPeriodLabel,
    checkinPage,
    setCheckinPage,
    checkinLimit,
    setCheckinLimit,
    checkinCount,
    checkinApprovedCount,
    checkinsLoading,
    uploadAvatar,
    updateProfile,
    checkUsernameAvailable,
    updatePassword
  };
}
