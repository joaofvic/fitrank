import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  leaderboardDateRangeForPeriod,
  rankingPeriodRangeLabel,
  todayLocalISODate
} from '../lib/dates.js';

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
  const [loading, setLoading] = useState(true);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshLeaderboard = useCallback(async () => {
    if (!supabase || !userId) return;
    setLeaderboardLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_tenant_leaderboard_period', {
        p_start: rankingStart,
        p_end: rankingEnd
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
          academia: r.academia || ''
        }))
      );
    } finally {
      setLeaderboardLoading(false);
    }
  }, [supabase, userId, rankingStart, rankingEnd]);

  const refreshCheckins = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data, error: qError } = await supabase
      .from('checkins')
      .select(
        'id, checkin_local_date, tipo_treino, points_awarded, foto_url, photo_review_status, photo_rejection_reason_code, photo_rejection_note'
      )
      .eq('user_id', userId)
      .order('checkin_local_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (qError) {
      console.error('FitRank: checkins', qError.message);
      return;
    }
    setCheckins(
      (data ?? []).map((c) => ({
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
  }, [supabase, userId]);

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

  const refreshAll = useCallback(async () => {
    if (!supabase || !userId) return;
    setError(null);
    await Promise.all([refreshLeaderboard(), refreshCheckins(), refreshNotifications()]);
    if (refreshProfile) await refreshProfile();
  }, [supabase, userId, refreshLeaderboard, refreshCheckins, refreshNotifications, refreshProfile]);

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
    async (tipoTreino, fotoFile = null) => {
      if (!supabase || !userId || !tenantId) {
        throw new Error('Sessão inválida');
      }
      if (!fotoFile || !(fotoFile.size > 0)) {
        throw new Error('Foto obrigatória para registrar o treino.');
      }
      const today = todayLocalISODate();
      let foto_url = null;

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

      const { error: insErr } = await supabase.from('checkins').insert({
        user_id: userId,
        tenant_id: tenantId,
        checkin_local_date: today,
        tipo_treino: tipoTreino,
        foto_url
      });

      if (insErr) {
        if (insErr.code === '23505') {
          const dup = new Error('Você já registrou este tipo de treino hoje.');
          dup.code = '23505';
          throw dup;
        }
        throw insErr;
      }

      await refreshAll();
    },
    [supabase, userId, tenantId, refreshAll]
  );

  return {
    leaderboard,
    checkins,
    notifications,
    loading,
    leaderboardLoading,
    error,
    setError,
    refreshAll,
    refreshLeaderboard,
    refreshCheckins,
    refreshNotifications,
    insertCheckin,
    rankingPeriod,
    setRankingPeriod,
    rankingPeriodLabel
  };
}
