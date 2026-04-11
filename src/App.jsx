import { useState, useEffect, useMemo } from 'react';
import { Home, Newspaper, Plus, TrendingUp, User, Zap } from 'lucide-react';

import { useAuth } from './components/auth/AuthProvider.jsx';
import { AuthScreen } from './components/auth/AuthScreen.jsx';
import { ResetPasswordScreen } from './components/auth/ResetPasswordScreen.jsx';
import { defaultUserData, loadFitRankState, saveFitRankState } from './lib/persist.js';
import { profileToUserData } from './lib/profile-map.js';
import { useFitCloudData } from './hooks/useFitCloudData.js';
import { useSocialData } from './hooks/useSocialData.js';
import { HomeView } from './components/views/HomeView.jsx';
import { FeedView } from './components/views/FeedView.jsx';
import { FriendsView } from './components/views/FriendsView.jsx';
import { ProfileView } from './components/views/ProfileView.jsx';
import { ChallengesView } from './components/views/ChallengesView.jsx';
import { CheckinModal } from './components/views/CheckinModal.jsx';
import { AdminTenantsView } from './components/views/AdminTenantsView.jsx';
import { AdminModerationView } from './components/views/AdminModerationView.jsx';
import { AdminModerationSettingsView } from './components/views/AdminModerationSettingsView.jsx';
import { AdminUsersView } from './components/views/AdminUsersView.jsx';
import { AdminEngagementView } from './components/views/AdminEngagementView.jsx';
import { AdminAuditView } from './components/views/AdminAuditView.jsx';
import { AdminChallengesView } from './components/views/AdminChallengesView.jsx';
import { PublicProfileView } from './components/views/PublicProfileView.jsx';

export default function App() {
  const {
    configured,
    loading: authLoading,
    session,
    profile,
    tenant,
    signOut,
    isPasswordRecovery,
    supabase,
    refreshProfile
  } = useAuth();

  const useCloud = Boolean(configured && session);

  const cloud = useFitCloudData({
    supabase: useCloud ? supabase : null,
    session: useCloud ? session : null,
    profile: useCloud ? profile : null,
    refreshProfile: useCloud ? refreshProfile : undefined
  });

  const social = useSocialData({
    supabase: useCloud ? supabase : null,
    session: useCloud ? session : null,
    profile: useCloud ? profile : null
  });

  const [userData, setUserData] = useState(() => loadFitRankState()?.userData ?? defaultUserData());
  const [checkins, setCheckins] = useState(() => loadFitRankState()?.checkins ?? []);
  const [view, setView] = useState('home');
  const [publicProfileUserId, setPublicProfileUserId] = useState(null);
  const [message, setMessage] = useState(null);

  const openPublicProfile = (userId) => {
    if (userId === localUser?.uid) {
      setView('profile');
      return;
    }
    setPublicProfileUserId(userId);
    setView('public-profile');
  };

  useEffect(() => {
    if (!useCloud) {
      saveFitRankState({ userData, checkins });
    }
  }, [useCloud, userData, checkins]);

  const localLeaderboard = useMemo(() => {
    return [{ ...userData }].sort((a, b) => (b.pontos || 0) - (a.pontos || 0));
  }, [userData]);

  const displayUserData = useMemo(() => {
    if (useCloud && profile && session?.user?.id) {
      return profileToUserData(profile, session.user.id);
    }
    return userData;
  }, [useCloud, profile, session?.user?.id, userData]);

  const displayCheckins = useCloud ? cloud.checkins : checkins;
  const displayLeaderboard = useCloud ? cloud.leaderboard : localLeaderboard;

  const localUser = useMemo(() => ({ uid: displayUserData.uid }), [displayUserData.uid]);

  const showToast = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCheckin = async (workoutType = 'Treino Geral', fotoFile = null, feedVisible = true, feedCaption = null) => {
    if (useCloud) {
      try {
        await cloud.insertCheckin(workoutType, fotoFile, feedVisible, feedCaption);
        showToast('Check-in realizado! +10 pontos ⚡');
        setView('home');
      } catch (err) {
        showToast(err.message ?? 'Falha no check-in');
      }
      return;
    }
    if (!fotoFile || !(fotoFile.size > 0)) {
      showToast('Foto obrigatória para registrar o treino.');
      return;
    }

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

  if (configured && authLoading) {
    return (
      <div className="min-h-screen bg-black text-zinc-500 flex items-center justify-center text-sm">
        Carregando sessão…
      </div>
    );
  }

  if (configured && session && isPasswordRecovery) {
    return <ResetPasswordScreen />;
  }

  if (configured && !session) {
    return <AuthScreen />;
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
            className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center"
          >
            <User size={20} className="text-zinc-400" />
          </button>
        </div>

        {view === 'home' && (
          <HomeView
            user={localUser}
            userData={displayUserData}
            allUsers={displayLeaderboard}
            rankingLoading={useCloud && (cloud.leaderboardLoading || cloud.loading)}
            rankingFilterEnabled={useCloud}
            rankingPeriod={cloud.rankingPeriod}
            onRankingPeriodChange={cloud.setRankingPeriod}
            rankingPeriodLabel={cloud.rankingPeriodLabel}
            onOpenCheckin={() => setView('checkin-modal')}
            onOpenProfile={useCloud ? openPublicProfile : undefined}
          />
        )}
        {view === 'feed' && useCloud && (
          <FeedView
            feed={social.feed}
            feedLoading={social.feedLoading}
            feedHasMore={social.feedHasMore}
            onLoadFeed={social.loadFeed}
            onLoadMoreFeed={social.loadMoreFeed}
            onRefreshFeed={social.refreshFeed}
            onToggleLike={social.toggleLike}
            onAddComment={social.addComment}
            onLoadComments={social.loadComments}
            onDeleteComment={social.deleteComment}
            onOpenFriends={() => setView('friends')}
            onOpenProfile={useCloud ? openPublicProfile : undefined}
            currentUserId={localUser?.uid}
          />
        )}
        {view === 'challenges' && <ChallengesView />}
        {view === 'profile' && (
          <ProfileView
            userData={displayUserData}
            checkins={displayCheckins}
            notifications={useCloud ? cloud.notifications : []}
            onMarkNotificationRead={
              useCloud
                ? async (id) => {
                    if (!id) return;
                    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
                    await cloud.refreshNotifications?.();
                  }
                : undefined
            }
            cloudTenant={tenant}
            cloudDisplayName={profile?.display_name}
            isPlatformMaster={profile?.is_platform_master}
            onOpenAdmin={profile?.is_platform_master ? () => setView('admin-tenants') : undefined}
            onOpenChallenges={profile?.is_platform_master ? () => setView('admin-challenges') : undefined}
            onOpenUsers={profile?.is_platform_master ? () => setView('admin-users') : undefined}
            onOpenModeration={profile?.is_platform_master ? () => setView('admin-moderation') : undefined}
            onOpenModerationSettings={
              profile?.is_platform_master ? () => setView('admin-moderation-settings') : undefined
            }
            onOpenEngagement={profile?.is_platform_master ? () => setView('admin-engagement') : undefined}
            onOpenAudit={profile?.is_platform_master ? () => setView('admin-audit') : undefined}
            onRetryCheckin={useCloud ? cloud.retryCheckin : undefined}
            onOpenFriends={useCloud ? () => setView('friends') : undefined}
            checkinPage={useCloud ? cloud.checkinPage : 0}
            checkinLimit={useCloud ? cloud.checkinLimit : 0}
            checkinCount={useCloud ? cloud.checkinCount : 0}
            checkinApprovedCount={useCloud ? cloud.checkinApprovedCount : undefined}
            checkinsLoading={useCloud ? cloud.checkinsLoading : false}
            onPageChange={useCloud ? cloud.setCheckinPage : undefined}
            onLimitChange={useCloud ? cloud.setCheckinLimit : undefined}
            onSignOut={configured ? signOut : undefined}
          />
        )}
        {view === 'friends' && useCloud && (
          <FriendsView
            friends={social.friends}
            friendsLoading={social.friendsLoading}
            pendingRequests={social.pendingRequests}
            sentRequests={social.sentRequests}
            onLoadFriends={social.loadFriends}
            onLoadPendingRequests={social.loadPendingRequests}
            onLoadSentRequests={social.loadSentRequests}
            onSearch={social.searchUsers}
            onSendRequest={social.sendFriendRequest}
            onAccept={social.acceptFriendRequest}
            onDecline={social.declineFriendRequest}
            onRemove={social.removeFriend}
            onOpenProfile={openPublicProfile}
            onBack={() => setView('home')}
          />
        )}
        {view === 'public-profile' && publicProfileUserId && useCloud && (
          <PublicProfileView
            userId={publicProfileUserId}
            onBack={() => setView('home')}
            onSendFriendRequest={social.sendFriendRequest}
          />
        )}
        {view === 'admin-tenants' && profile?.is_platform_master && (
          <AdminTenantsView onBack={() => setView('profile')} />
        )}
        {view === 'admin-challenges' && profile?.is_platform_master && (
          <AdminChallengesView onBack={() => setView('profile')} />
        )}
        {view === 'admin-moderation' && profile?.is_platform_master && (
          <AdminModerationView onBack={() => setView('profile')} />
        )}
        {view === 'admin-moderation-settings' && profile?.is_platform_master && (
          <AdminModerationSettingsView onBack={() => setView('profile')} />
        )}
        {view === 'admin-users' && profile?.is_platform_master && (
          <AdminUsersView onBack={() => setView('profile')} />
        )}
        {view === 'admin-engagement' && profile?.is_platform_master && (
          <AdminEngagementView onBack={() => setView('profile')} />
        )}
        {view === 'admin-audit' && profile?.is_platform_master && (
          <AdminAuditView onBack={() => setView('profile')} />
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
              view === 'home' ? 'text-white' : 'text-zinc-600'
            }`}
          >
            <Home size={24} className={view === 'home' ? 'fill-white/10' : ''} />
            <span className="text-[10px] font-bold uppercase">Home</span>
          </button>
          <button
            type="button"
            onClick={() => setView('feed')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              view === 'feed' ? 'text-white' : 'text-zinc-600'
            }`}
          >
            <Newspaper size={24} className={view === 'feed' ? 'fill-white/10' : ''} />
            <span className="text-[10px] font-bold uppercase">Feed</span>
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
            onClick={() => setView('challenges')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              view === 'challenges' ? 'text-white' : 'text-zinc-600'
            }`}
          >
            <TrendingUp size={24} />
            <span className="text-[10px] font-bold uppercase">Desafios</span>
          </button>
          <button
            type="button"
            onClick={() => setView('profile')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              view === 'profile' ? 'text-white' : 'text-zinc-600'
            }`}
          >
            <User size={24} className={view === 'profile' ? 'fill-white/10' : ''} />
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
