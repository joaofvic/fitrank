import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  leaderboardDateRangeForPeriod,
  rankingPeriodRangeLabel,
  todayLocalISODate
} from '../lib/dates.js';
import { extractMentions } from '../lib/mention-parser.js';
import { extractHashtags } from '../lib/hashtag-parser.js';
import { logger } from '../lib/logger.js';
import { analytics } from '../lib/analytics.js';

/**
 * Dados FitRank na nuvem (ranking, check-ins, realtime leve).
 */
export function useFitCloudData({ supabase, session, profile, refreshProfile }) {
  const userId = session?.user?.id ?? null;
  const tenantId = profile?.tenant_id ?? null;
  const LEADERBOARD_TOP_LIMIT = 10;
  const LEADERBOARD_CACHE_TTL_MS = 12_000;

  /** US-1.4: `compact` (Top 10 + “Sua posição”) | `full` (RPCs legadas, lista completa). Build-time (Vite). */
  const rankingListMode = useMemo(() => {
    const v = String(import.meta.env.VITE_RANKING_LIST_MODE || 'compact').trim().toLowerCase();
    return v === 'full' ? 'full' : 'compact';
  }, []);

  const leaderboardCacheRef = useRef({
    general: { key: null, ts: 0, top: [], me: null },
    league: { key: null, ts: 0, top: [], me: null }
  });

  const [rankingPeriod, setRankingPeriod] = useState('month');
  const { start: rankingStart, end: rankingEnd } = useMemo(
    () => leaderboardDateRangeForPeriod(rankingPeriod),
    [rankingPeriod]
  );
  const rankingPeriodLabel = useMemo(
    () => rankingPeriodRangeLabel(rankingPeriod, rankingStart, rankingEnd),
    [rankingPeriod, rankingStart, rankingEnd]
  );

  const [leaderboardTop, setLeaderboardTop] = useState([]);
  const [myLeaderboardEntry, setMyLeaderboardEntry] = useState(null);
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
  const previousRankRef = useRef({});

  const refreshLeaderboard = useCallback(async () => {
    if (!supabase || !userId) return;
    setLeaderboardLoading(true);
    try {
      const listKey = rankingListMode === 'full' ? 'list:full' : `top:${LEADERBOARD_TOP_LIMIT}`;
      const cacheKey = `${tenantId || ''}|${rankingPeriod}|${String(rankingStart)}|${String(rankingEnd)}|${listKey}`;
      const cache = leaderboardCacheRef.current.general;
      if (cache.key === cacheKey && Date.now() - cache.ts < LEADERBOARD_CACHE_TTL_MS) {
        setLeaderboardTop(cache.top || []);
        setMyLeaderboardEntry(cache.me || null);
        return;
      }

      if (rankingListMode === 'full') {
        const { data, error: rpcError } = await supabase.rpc('get_tenant_leaderboard_period', {
          p_start: rankingStart,
          p_end: rankingEnd,
          p_period: rankingPeriod
        });
        if (rpcError) {
          logger.error('ranking.full', rpcError, {
            tab: 'general',
            period: rankingPeriod,
            start: String(rankingStart),
            end: String(rankingEnd),
            tenantId: tenantId || null,
            mode: 'full'
          });
          return;
        }
        const rows = Array.isArray(data) ? data : [];
        const prevMap = previousRankRef.current;
        const mapped = rows.map((r, i) => {
          const rank = i + 1;
          const prevRank = prevMap[r.id] ?? null;
          return {
            uid: r.id,
            nome: r.nome_exibicao,
            pontos: r.pontos,
            is_pro: r.is_pro,
            academia: r.academia || '',
            avatar_url: r.avatar_url || null,
            xp: r.xp ?? 0,
            league: r.league ?? 'bronze',
            rank,
            prevRank
          };
        });
        const newMap = {};
        mapped.forEach((u) => { newMap[u.uid] = u.rank; });
        previousRankRef.current = newMap;
        setLeaderboardTop(mapped);
        setMyLeaderboardEntry(null);

        leaderboardCacheRef.current.general = {
          key: cacheKey,
          ts: Date.now(),
          top: mapped,
          me: null
        };
        return;
      }

      const [topRes, meRes] = await Promise.all([
        supabase.rpc('get_tenant_leaderboard_top_period', {
          p_start: rankingStart,
          p_end: rankingEnd,
          p_period: rankingPeriod,
          p_limit: LEADERBOARD_TOP_LIMIT
        }),
        supabase.rpc('get_my_tenant_rank_period', {
          p_start: rankingStart,
          p_end: rankingEnd,
          p_period: rankingPeriod
        })
      ]);

      if (topRes.error) {
        logger.error('ranking.top', topRes.error, {
          tab: 'general',
          period: rankingPeriod,
          start: String(rankingStart),
          end: String(rankingEnd),
          tenantId: tenantId || null,
          mode: 'compact'
        });
        return;
      }
      if (meRes.error) {
        logger.error('ranking.me', meRes.error, {
          tab: 'general',
          period: rankingPeriod,
          start: String(rankingStart),
          end: String(rankingEnd),
          tenantId: tenantId || null,
          mode: 'compact'
        });
      }

      const rows = Array.isArray(topRes.data) ? topRes.data : [];
      const meRow = Array.isArray(meRes.data) ? meRes.data[0] : meRes.data;
      const prevMap = previousRankRef.current;
      const mapped = rows.map((r, i) => {
        const rank = typeof r.rank === 'number' ? r.rank : i + 1;
        const prevRank = prevMap[r.id] ?? null;
        return {
          uid: r.id,
          nome: r.nome_exibicao,
          pontos: r.pontos,
          is_pro: r.is_pro,
          academia: r.academia || '',
          avatar_url: r.avatar_url || null,
          xp: r.xp ?? 0,
          league: r.league ?? 'bronze',
          rank,
          prevRank
        };
      });
      const newMap = {};
      mapped.forEach((u) => { newMap[u.uid] = u.rank; });
      previousRankRef.current = newMap;
      setLeaderboardTop(mapped);

      let meEntry = null;
      if (meRow && meRow.id) {
        const rank = typeof meRow.rank === 'number' ? meRow.rank : null;
        const prevRank = prevMap[meRow.id] ?? null;
        meEntry = {
          uid: meRow.id,
          nome: meRow.nome_exibicao,
          pontos: meRow.pontos,
          is_pro: meRow.is_pro,
          academia: meRow.academia || '',
          avatar_url: meRow.avatar_url || null,
          xp: meRow.xp ?? 0,
          league: meRow.league ?? 'bronze',
          rank,
          prevRank
        };
      }
      setMyLeaderboardEntry(meEntry);

      leaderboardCacheRef.current.general = {
        key: cacheKey,
        ts: Date.now(),
        top: mapped,
        me: meEntry
      };
    } finally {
      setLeaderboardLoading(false);
    }
  }, [supabase, userId, tenantId, rankingStart, rankingEnd, rankingPeriod, rankingListMode]);

  // --- League Ranking ---
  const [leagueLeaderboardTop, setLeagueLeaderboardTop] = useState([]);
  const [myLeagueLeaderboardEntry, setMyLeagueLeaderboardEntry] = useState(null);
  const [leagueLoading, setLeagueLoading] = useState(false);

  const refreshLeagueRanking = useCallback(async () => {
    if (!supabase || !userId) return;
    setLeagueLoading(true);
    try {
      const listKey = rankingListMode === 'full' ? 'list:full' : `top:${LEADERBOARD_TOP_LIMIT}`;
      const cacheKey = `${tenantId || ''}|${rankingPeriod}|${String(rankingStart)}|${String(rankingEnd)}|${listKey}`;
      const cache = leaderboardCacheRef.current.league;
      if (cache.key === cacheKey && Date.now() - cache.ts < LEADERBOARD_CACHE_TTL_MS) {
        setLeagueLeaderboardTop(cache.top || []);
        setMyLeagueLeaderboardEntry(cache.me || null);
        return;
      }

      if (rankingListMode === 'full') {
        const { data, error: rpcError } = await supabase.rpc('get_league_leaderboard', {
          p_start: rankingStart,
          p_end: rankingEnd,
          p_period: rankingPeriod
        });
        if (rpcError) {
          logger.error('league ranking.full', rpcError, {
            tab: 'league',
            period: rankingPeriod,
            start: String(rankingStart),
            end: String(rankingEnd),
            tenantId: tenantId || null,
            mode: 'full'
          });
          return;
        }
        const rows = Array.isArray(data) ? data : [];
        const topMapped = rows.map((r, i) => ({
          uid: r.id,
          nome: r.nome_exibicao,
          pontos: r.pontos,
          is_pro: r.is_pro,
          academia: r.academia || '',
          avatar_url: r.avatar_url || null,
          xp: r.xp ?? 0,
          league: r.league ?? 'bronze',
          rank: i + 1
        }));
        setLeagueLeaderboardTop(topMapped);
        setMyLeagueLeaderboardEntry(null);

        leaderboardCacheRef.current.league = {
          key: cacheKey,
          ts: Date.now(),
          top: topMapped,
          me: null
        };
        return;
      }

      const [topRes, meRes] = await Promise.all([
        supabase.rpc('get_league_leaderboard_top', {
          p_start: rankingStart,
          p_end: rankingEnd,
          p_period: rankingPeriod,
          p_limit: LEADERBOARD_TOP_LIMIT
        }),
        supabase.rpc('get_my_league_rank_period', {
          p_start: rankingStart,
          p_end: rankingEnd,
          p_period: rankingPeriod
        })
      ]);

      if (topRes.error) {
        logger.error('league ranking.top', topRes.error, {
          tab: 'league',
          period: rankingPeriod,
          start: String(rankingStart),
          end: String(rankingEnd),
          tenantId: tenantId || null,
          mode: 'compact'
        });
        return;
      }
      if (meRes.error) {
        logger.error('league ranking.me', meRes.error, {
          tab: 'league',
          period: rankingPeriod,
          start: String(rankingStart),
          end: String(rankingEnd),
          tenantId: tenantId || null,
          mode: 'compact'
        });
      }

      const rows = Array.isArray(topRes.data) ? topRes.data : [];
      const meRow = Array.isArray(meRes.data) ? meRes.data[0] : meRes.data;

      const topMapped = rows.map((r, i) => ({
          uid: r.id,
          nome: r.nome_exibicao,
          pontos: r.pontos,
          is_pro: r.is_pro,
          academia: r.academia || '',
          avatar_url: r.avatar_url || null,
          xp: r.xp ?? 0,
          league: r.league ?? 'bronze',
          rank: typeof r.rank === 'number' ? r.rank : i + 1
      }));
      setLeagueLeaderboardTop(topMapped);

      let meEntry = null;
      if (meRow && meRow.id) {
        meEntry = {
          uid: meRow.id,
          nome: meRow.nome_exibicao,
          pontos: meRow.pontos,
          is_pro: meRow.is_pro,
          academia: meRow.academia || '',
          avatar_url: meRow.avatar_url || null,
          xp: meRow.xp ?? 0,
          league: meRow.league ?? 'bronze',
          rank: typeof meRow.rank === 'number' ? meRow.rank : null
        };
      }
      setMyLeagueLeaderboardEntry(meEntry);

      leaderboardCacheRef.current.league = {
        key: cacheKey,
        ts: Date.now(),
        top: topMapped,
        me: meEntry
      };
    } finally {
      setLeagueLoading(false);
    }
  }, [supabase, userId, tenantId, rankingStart, rankingEnd, rankingPeriod, rankingListMode]);

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
        logger.error('checkins', pageResult.error);
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
      logger.error('notifications', nErr);
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
      logger.error('readNotifications', nErr);
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
      setLeaderboardTop([]);
      setMyLeaderboardEntry(null);
      setLeagueLeaderboardTop([]);
      setMyLeagueLeaderboardEntry(null);
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
          logger.warn('Realtime indisponível; use atualização manual ou habilite a publicação no Supabase.');
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
    async (tipoTreino, fotoFile = null, feedVisible = true, feedCaption = null, extras = {}) => {
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

      const checkinRow = {
        user_id: userId,
        tenant_id: tenantId,
        checkin_local_date: today,
        tipo_treino: tipoTreino,
        foto_url,
        feed_visible: feedVisible,
        feed_caption: trimmedCaption,
      };
      if (extras.duration_seconds) checkinRow.duration_seconds = extras.duration_seconds;
      if (extras.notes) checkinRow.notes = extras.notes;

      const { data: insData, error: insErr } = await supabase.from('checkins').insert(checkinRow).select('id').single();

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
          }).catch((err) => logger.error('save mentions', err));
        }

        const tags = extractHashtags(trimmedCaption);
        if (tags.length > 0) {
          await supabase.rpc('save_checkin_hashtags', {
            p_checkin_id: insData.id,
            p_tags: tags
          }).catch((err) => logger.error('save hashtags', err));
        }
      }

      if (extras.weight_kg && insData?.id) {
        await supabase.from('body_measurements').insert({
          user_id: userId,
          weight_kg: extras.weight_kg,
          checkin_id: insData.id,
        }).catch((err) => logger.error('save body measurement', err));
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
        logger.error('checkUsername', rpcErr);
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

  const checkStreakRecovery = useCallback(
    async () => {
      if (!supabase || !userId) return null;
      const { data, error: err } = await supabase.rpc('can_recover_streak');
      if (err) { logger.error('can_recover_streak', err); return null; }
      return data;
    },
    [supabase, userId]
  );

  const recoverStreak = useCallback(
    async (gapDate) => {
      if (!supabase || !userId) return { error: 'Não autenticado' };
      const { data, error: err } = await supabase.rpc('recover_streak', { p_date: gapDate || null });
      if (err) { logger.error('recover_streak', err); return { error: err.message }; }
      if (data?.error) return data;
      analytics.streakRecovery({ streak_days: Number(data?.streak_after ?? 0) });
      if (refreshProfile) await refreshProfile();
      return data;
    },
    [supabase, userId, refreshProfile]
  );

  const getBoostStatus = useCallback(
    async () => {
      if (!supabase || !userId) return null;
      const { data, error: err } = await supabase.rpc('get_boost_status');
      if (err) { logger.error('get_boost_status', err); return null; }
      return data;
    },
    [supabase, userId]
  );

  const purchaseBoost = useCallback(
    async (points) => {
      if (!supabase || !userId) return { error: 'Não autenticado' };
      const { data, error: err } = await supabase.rpc('purchase_boost', { p_points: points });
      if (err) { logger.error('purchase_boost', err); return { error: err.message }; }
      if (data?.error) return data;
      analytics.boostPurchased({ points: Number(data?.points_added ?? points) });
      if (refreshProfile) await refreshProfile();
      refreshLeaderboard();
      return data;
    },
    [supabase, userId, refreshProfile, refreshLeaderboard]
  );

  return {
    rankingListMode,
    leaderboardTop,
    myLeaderboardEntry,
    checkins,
    notifications,
    readNotifications,
    loading,
    leaderboardLoading,
    error,
    setError,
    refreshAll,
    refreshLeaderboard,
    leagueLeaderboardTop,
    myLeagueLeaderboardEntry,
    leagueLoading,
    refreshLeagueRanking,
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
    updatePassword,
    checkStreakRecovery,
    recoverStreak,
    getBoostStatus,
    purchaseBoost
  };
}
