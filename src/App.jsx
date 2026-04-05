import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trophy, TrendingUp, Plus, User, Zap } from 'lucide-react';

import { supabase, isSupabaseConfigured, getSupabaseUrl } from './lib/supabase/client.js';
import { AuthScreen } from './components/auth/AuthScreen.jsx';
import { HomeView } from './components/views/HomeView.jsx';
import { ProfileView } from './components/views/ProfileView.jsx';
import { ChallengesView } from './components/views/ChallengesView.jsx';
import { CheckinModal } from './components/views/CheckinModal.jsx';
import { Card } from './components/ui/Card.jsx';

function mapProfileRow(p) {
  return {
    uid: p.id,
    nome: p.display_name,
    pontos: p.pontos,
    streak: p.streak,
    is_pro: p.is_pro,
    academia: p.academia ?? '',
    last_checkin: p.last_checkin_date,
    created_at: p.created_at
  };
}

function mapCheckinRow(c) {
  return {
    id: c.id,
    date: c.workout_date,
    type: c.tipo_treino,
    points_earned: c.points_earned,
    foto_url: c.foto_url
  };
}

function ConfigMissing() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <Card className="max-w-lg border-zinc-800 bg-zinc-900 p-8 space-y-4">
        <h1 className="text-2xl font-black text-green-500">FitRank</h1>
        <p className="text-zinc-400">
          Defina <code className="text-green-400">VITE_SUPABASE_URL</code> e{' '}
          <code className="text-green-400">VITE_SUPABASE_ANON_KEY</code> em{' '}
          <code className="text-zinc-500">.env.local</code> e reinicie o Vite.
        </p>
      </Card>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [checkins, setCheckins] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [challengeRanking, setChallengeRanking] = useState([]);
  const [tenantId, setTenantId] = useState(null);
  const [view, setView] = useState('home');
  const [message, setMessage] = useState(null);

  const configured = isSupabaseConfigured();

  const showToast = useCallback((msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3200);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  const refreshProfileAndLists = useCallback(
    async (uid) => {
      if (!supabase || !uid) return;
      const { data: me, error: meErr } = await supabase.from('profiles').select('*').eq('id', uid).single();
      if (meErr || !me) {
        console.error(meErr);
        return;
      }
      setUserData(mapProfileRow(me));
      setTenantId(me.tenant_id);

      const { data: rank } = await supabase.from('profiles').select('*').order('pontos', { ascending: false });
      setLeaderboard((rank ?? []).map(mapProfileRow));

      const { data: ck } = await supabase
        .from('checkins')
        .select('*')
        .eq('user_id', uid)
        .order('workout_date', { ascending: false });
      setCheckins((ck ?? []).map(mapCheckinRow));

      const { data: des } = await supabase.from('desafios').select('*').eq('ativo', true).order('starts_on', { ascending: false });
      setChallenges(des ?? []);
    },
    []
  );

  useEffect(() => {
    if (session?.user?.id) {
      refreshProfileAndLists(session.user.id);
    } else {
      setUserData(null);
      setCheckins([]);
      setLeaderboard([]);
      setChallenges([]);
      setTenantId(null);
    }
  }, [session?.user?.id, refreshProfileAndLists]);

  useEffect(() => {
    if (!supabase || !session?.user?.id || !tenantId) return;

    const channel = supabase
      .channel(`tenant-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `tenant_id=eq.${tenantId}` },
        () => {
          refreshProfileAndLists(session.user.id);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkins', filter: `tenant_id=eq.${tenantId}` },
        () => {
          refreshProfileAndLists(session.user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, tenantId, refreshProfileAndLists]);

  const loadChallengeRanking = useCallback(
    async (desafioId) => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('desafio_participantes')
        .select('pontos_no_desafio, user_id, profiles(display_name)')
        .eq('desafio_id', desafioId)
        .order('pontos_no_desafio', { ascending: false })
        .limit(50);
      if (error) {
        console.error(error);
        return;
      }
      setChallengeRanking(
        (data ?? []).map((row, idx) => ({
          rank: idx + 1,
          userId: row.user_id,
          nome: row.profiles?.display_name ?? 'Atleta',
          pontos: row.pontos_no_desafio,
          isSelf: row.user_id === session?.user?.id
        }))
      );
    },
    [session?.user?.id]
  );

  useEffect(() => {
    if (view === 'challenges' && challenges.length > 0) {
      loadChallengeRanking(challenges[0].id);
    }
  }, [view, challenges, loadChallengeRanking]);

  const localUser = useMemo(() => ({ uid: session?.user?.id }), [session?.user?.id]);

  const allUsers = useMemo(() => {
    if (leaderboard.length > 0) return leaderboard;
    return userData ? [userData] : [];
  }, [leaderboard, userData]);

  const handleCheckin = async (workoutType, fotoUrl = null) => {
    if (!supabase || !session?.user) return;
    const { data, error } = await supabase.rpc('fitrank_create_checkin', {
      p_tipo_treino: workoutType,
      p_foto_url: fotoUrl
    });
    if (error) {
      if (error.code === '23505' || error.message?.includes('already_checked')) {
        showToast('Você já registrou este treino hoje para esse tipo.');
      } else {
        showToast(error.message || 'Falha no check-in');
      }
      return;
    }
    setUserData((prev) =>
      prev
        ? {
            ...prev,
            pontos: data?.pontos ?? prev.pontos,
            streak: data?.streak ?? prev.streak,
            last_checkin: data?.workout_date ?? prev.last_checkin
          }
        : prev
    );
    await refreshProfileAndLists(session.user.id);
    showToast('Check-in realizado! +10 pontos');
    setView('home');
  };

  const handleJoinChallenge = async (desafioId) => {
    if (!supabase) return;
    const { error } = await supabase.rpc('fitrank_join_desafio', { p_desafio_id: desafioId });
    if (error) {
      showToast(error.message);
      return;
    }
    showToast('Você entrou no desafio!');
    loadChallengeRanking(desafioId);
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setView('home');
  };

  const handleUpgradePro = async () => {
    const priceId = import.meta.env.VITE_STRIPE_PRICE_ID_PRO;
    if (!priceId || !session?.access_token) {
      showToast('Configure VITE_STRIPE_PRICE_ID_PRO e o backend Stripe.');
      return;
    }
    const base = getSupabaseUrl().replace(/\/$/, '');
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
    try {
      const res = await fetch(`${base}/functions/v1/stripe-checkout-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: anon,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          priceId,
          successUrl: `${window.location.origin}?checkout=success`,
          cancelUrl: `${window.location.origin}?checkout=cancel`,
          mode: 'subscription'
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'checkout_failed');
      if (json.url) window.location.href = json.url;
    } catch (e) {
      showToast(e.message || 'Erro ao abrir checkout');
    }
  };

  const handleOpenPortal = async () => {
    if (!session?.access_token) return;
    const base = getSupabaseUrl().replace(/\/$/, '');
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
    try {
      const res = await fetch(`${base}/functions/v1/stripe-customer-portal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: anon,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ returnUrl: window.location.origin })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'portal_failed');
      if (json.url) window.location.href = json.url;
    } catch (e) {
      showToast(e.message || 'Portal indisponível');
    }
  };

  if (!configured) {
    return <ConfigMissing />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-500">Carregando…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <AuthScreen
        supabase={supabase}
        defaultTenantSlug={import.meta.env.VITE_DEFAULT_TENANT_SLUG ?? 'demo'}
        onAuthed={() => supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))}
      />
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-green-500/30 overflow-x-hidden">
      <div className="max-w-lg mx-auto px-4 pt-8 pb-24 min-h-screen">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600 uppercase">
            FitRank
          </h1>
          <button
            type="button"
            onClick={() => setView('profile')}
            className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center"
            aria-label="Perfil"
          >
            <User size={20} className="text-zinc-400" />
          </button>
        </div>

        {view === 'home' && (
          <HomeView
            user={localUser}
            userData={userData}
            allUsers={allUsers}
            onOpenCheckin={() => setView('checkin-modal')}
          />
        )}
        {view === 'challenges' && (
          <ChallengesView challenges={challenges} ranking={challengeRanking} onJoin={handleJoinChallenge} />
        )}
        {view === 'profile' && (
          <ProfileView
            userData={userData}
            checkins={checkins}
            onLogout={handleLogout}
            onUpgradePro={handleUpgradePro}
            onOpenPortal={handleOpenPortal}
            hasStripePrice={Boolean(import.meta.env.VITE_STRIPE_PRICE_ID_PRO)}
          />
        )}

        {view === 'checkin-modal' && (
          <CheckinModal
            onClose={() => setView('home')}
            onCheckin={handleCheckin}
            supabase={supabase}
            tenantId={tenantId}
            userId={session.user.id}
          />
        )}

        {message && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-black px-6 py-3 rounded-full font-bold shadow-xl shadow-green-500/20 flex items-center gap-2 animate-in-toast">
            <Zap size={18} />
            {message}
          </div>
        )}

        <div className="fixed bottom-0 left-0 right-0 h-20 bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-800 px-6 flex items-center justify-between z-40 max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => setView('home')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              view === 'home' ? 'text-green-500' : 'text-zinc-600'
            }`}
          >
            <Trophy size={24} className={view === 'home' ? 'fill-green-500/10' : ''} />
            <span className="text-[10px] font-bold uppercase">Ranking</span>
          </button>
          <button
            type="button"
            onClick={() => setView('challenges')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              view === 'challenges' ? 'text-green-500' : 'text-zinc-600'
            }`}
          >
            <TrendingUp size={24} />
            <span className="text-[10px] font-bold uppercase">Desafios</span>
          </button>
          <button type="button" onClick={() => setView('checkin-modal')} className="flex flex-col items-center -mt-10">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/40 active:scale-90 transition-transform">
              <Plus size={32} className="text-black" />
            </div>
          </button>
          <button
            type="button"
            className="flex flex-col items-center gap-1 text-zinc-600 opacity-50 grayscale cursor-not-allowed"
          >
            <Zap size={24} />
            <span className="text-[10px] font-bold uppercase">Store</span>
          </button>
          <button
            type="button"
            onClick={() => setView('profile')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              view === 'profile' ? 'text-green-500' : 'text-zinc-600'
            }`}
          >
            <User size={24} className={view === 'profile' ? 'fill-green-500/10' : ''} />
            <span className="text-[10px] font-bold uppercase">Perfil</span>
          </button>
        </div>
      </div>

      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 opacity-30">
        <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-500/5 blur-[100px]" />
      </div>
    </div>
  );
}
