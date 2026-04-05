import { useState, useEffect, useMemo } from 'react';
import { Trophy, TrendingUp, Plus, User, Zap } from 'lucide-react';

import { useAuth } from './components/auth/AuthProvider.jsx';
import { AuthScreen } from './components/auth/AuthScreen.jsx';
import { defaultUserData, loadFitRankState, saveFitRankState } from './lib/persist.js';
import { HomeView } from './components/views/HomeView.jsx';
import { ProfileView } from './components/views/ProfileView.jsx';
import { ChallengesView } from './components/views/ChallengesView.jsx';
import { CheckinModal } from './components/views/CheckinModal.jsx';
import { AdminTenantsView } from './components/views/AdminTenantsView.jsx';

export default function App() {
  const { configured, loading: authLoading, session, profile, tenant, signOut } = useAuth();
  const [userData, setUserData] = useState(() => loadFitRankState()?.userData ?? defaultUserData());
  const [checkins, setCheckins] = useState(() => loadFitRankState()?.checkins ?? []);
  const [view, setView] = useState('home');
  const [message, setMessage] = useState(null);

  if (configured && authLoading) {
    return (
      <div className="min-h-screen bg-black text-zinc-500 flex items-center justify-center text-sm">
        Carregando sessão…
      </div>
    );
  }

  if (configured && !session) {
    return <AuthScreen />;
  }

  useEffect(() => {
    saveFitRankState({ userData, checkins });
  }, [userData, checkins]);

  const localUser = useMemo(() => ({ uid: userData.uid }), [userData.uid]);

  const allUsers = useMemo(() => {
    return [{ ...userData }].sort((a, b) => (b.pontos || 0) - (a.pontos || 0));
  }, [userData]);

  const showToast = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCheckin = (workoutType = 'Treino Geral') => {
    const todayStr = new Date().toISOString().split('T')[0];

    if (userData.last_checkin === todayStr) {
      showToast('Você já treinou hoje! Volte amanhã. 💪');
      return;
    }

    let newStreak = 1;
    if (userData.last_checkin) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (userData.last_checkin === yesterdayStr) {
        newStreak = (userData.streak || 0) + 1;
      } else if (userData.last_checkin !== todayStr) {
        newStreak = 1;
      }
    }

    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ck-${Date.now()}`;

    setCheckins((prev) =>
      [
        {
          id,
          date: todayStr,
          type: workoutType,
          points_earned: 10
        },
        ...prev
      ].sort((a, b) => new Date(b.date) - new Date(a.date))
    );

    setUserData((prev) => ({
      ...prev,
      pontos: (prev.pontos || 0) + 10,
      streak: newStreak,
      last_checkin: todayStr
    }));

    showToast('Check-in realizado! +10 pontos ⚡');
    setView('home');
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-green-500/30 overflow-x-hidden">
      <div className="max-w-lg mx-auto px-4 pt-8 pb-24 min-h-screen">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600 uppercase">
            FitRank
          </h1>
          <button
            type="button"
            className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center"
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
        {view === 'challenges' && <ChallengesView />}
        {view === 'profile' && (
          <ProfileView
            userData={userData}
            checkins={checkins}
            cloudTenant={tenant}
            cloudDisplayName={profile?.display_name}
            isPlatformMaster={profile?.is_platform_master}
            onOpenAdmin={profile?.is_platform_master ? () => setView('admin-tenants') : undefined}
            onSignOut={configured ? signOut : undefined}
          />
        )}
        {view === 'admin-tenants' && profile?.is_platform_master && (
          <AdminTenantsView onBack={() => setView('profile')} />
        )}

        {view === 'checkin-modal' && (
          <CheckinModal onClose={() => setView('home')} onCheckin={handleCheckin} />
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
          <button
            type="button"
            onClick={() => setView('checkin-modal')}
            className="flex flex-col items-center -mt-10"
          >
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
