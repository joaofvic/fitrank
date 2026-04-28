import { lazy, Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArrowLeft, Bell, Home, Newspaper, Plus, TrendingUp, User, Zap } from 'lucide-react';

import { useAuth } from './components/auth/AuthProvider.jsx';
import { AuthScreen } from './components/auth/AuthScreen.jsx';
import { ResetPasswordScreen } from './components/auth/ResetPasswordScreen.jsx';
import { analytics } from './lib/analytics.js';
import { defaultUserData, loadFitRankState, saveFitRankState } from './lib/persist.js';
import { profileToUserData, calculateLevel } from './lib/profile-map.js';
import { useFitCloudData } from './hooks/useFitCloudData.js';
import { useSocialData } from './hooks/useSocialData.js';
import { HomeView } from './components/views/HomeView.jsx';
import { FeedView } from './components/views/FeedView.jsx';
import { ProfileView } from './components/views/ProfileView.jsx';
import { CelebrationOverlay } from './components/views/CelebrationOverlay.jsx';
import { LeaguePromotionOverlay } from './components/views/LeaguePromotionOverlay.jsx';
import { SwUpdateToast } from './components/ui/SwUpdateToast.jsx';
import { InstallPrompt } from './components/ui/InstallPrompt.jsx';
import { AnimatedViewContainer } from './components/ui/AnimatedViewContainer.jsx';
import { PullToRefreshIndicator } from './components/ui/PullToRefreshIndicator.jsx';
import { ViewSkeleton } from './components/ui/ViewSkeleton.jsx';
import { useSwipeNavigation } from './hooks/useSwipeNavigation.js';
import { usePullToRefresh } from './hooks/usePullToRefresh.js';
import { useNavigationStack } from './hooks/useNavigationStack.js';
import { useWorkoutTimer } from './hooks/useWorkoutTimer.js';
import { usePushNotifications } from './hooks/usePushNotifications.js';
import { MiniTimer } from './components/ui/MiniTimer.jsx';
import { PushPermissionPrompt } from './components/ui/PushPermissionPrompt.jsx';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard.jsx';

const lazyNamed = (loader, name) => lazy(() => loader().then(m => ({ default: m[name] })));

const FriendsView = lazyNamed(() => import('./components/views/FriendsView.jsx'), 'FriendsView');
const ChallengesView = lazyNamed(() => import('./components/views/ChallengesView.jsx'), 'ChallengesView');
const CheckinModal = lazyNamed(() => import('./components/views/CheckinModal.jsx'), 'CheckinModal');
const PublicProfileView = lazyNamed(() => import('./components/views/PublicProfileView.jsx'), 'PublicProfileView');
const NotificationsView = lazyNamed(() => import('./components/views/NotificationsView.jsx'), 'NotificationsView');
const EditProfileView = lazyNamed(() => import('./components/views/EditProfileView.jsx'), 'EditProfileView');
const HashtagFeedView = lazyNamed(() => import('./components/views/HashtagFeedView.jsx'), 'HashtagFeedView');
const StoryCreator = lazyNamed(() => import('./components/views/StoryCreator.jsx'), 'StoryCreator');
const StoryViewer = lazyNamed(() => import('./components/views/StoryViewer.jsx'), 'StoryViewer');
const WorkoutTimerView = lazyNamed(() => import('./components/views/WorkoutTimerView.jsx'), 'WorkoutTimerView');
const ProgressView = lazyNamed(() => import('./components/views/ProgressView.jsx'), 'ProgressView');
const StatsView = lazyNamed(() => import('./components/views/StatsView.jsx'), 'StatsView');
const WorkoutPlanView = lazyNamed(() => import('./components/views/WorkoutPlanView.jsx'), 'WorkoutPlanView');
const WorkoutPlanGeneratorView = lazyNamed(() => import('./components/views/WorkoutPlanGeneratorView.jsx'), 'WorkoutPlanGeneratorView');
const PushPreferencesView = lazyNamed(() => import('./components/views/PushPreferencesView.jsx'), 'PushPreferencesView');

const AdminTenantsView = lazyNamed(() => import('./components/views/AdminTenantsView.jsx'), 'AdminTenantsView');
const AdminModerationView = lazyNamed(() => import('./components/views/AdminModerationView.jsx'), 'AdminModerationView');
const AdminModerationSettingsView = lazyNamed(() => import('./components/views/AdminModerationSettingsView.jsx'), 'AdminModerationSettingsView');
const AdminUsersView = lazyNamed(() => import('./components/views/AdminUsersView.jsx'), 'AdminUsersView');
const AdminEngagementView = lazyNamed(() => import('./components/views/AdminEngagementView.jsx'), 'AdminEngagementView');
const AdminAuditView = lazyNamed(() => import('./components/views/AdminAuditView.jsx'), 'AdminAuditView');
const AdminChallengesView = lazyNamed(() => import('./components/views/AdminChallengesView.jsx'), 'AdminChallengesView');
const AdminBillingView = lazyNamed(() => import('./components/views/AdminBillingView.jsx'), 'AdminBillingView');
const AdminObservabilityView = lazyNamed(() => import('./components/views/AdminObservabilityView.jsx'), 'AdminObservabilityView');

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

  const { view, transitionDir, routeParam, navigate, goBack, canGoBack } = useNavigationStack();
  const mainContentRef = useRef(null);
  const challengesRefreshRef = useRef(null);
  const statsRefreshRef = useRef(null);
  const [timerDuration, setTimerDuration] = useState(null);
  const workoutTimer = useWorkoutTimer();

  const push = usePushNotifications({
    supabase: useCloud ? supabase : null,
    session: useCloud ? session : null,
    profile: useCloud ? profile : null,
    navigate,
  });

  const [showPushPrompt, setShowPushPrompt] = useState(false);

  const [publicProfileUserId, setPublicProfileUserId] = useState(() => {
    if (view === 'public-profile' && routeParam) return routeParam;
    return null;
  });
  const [hashtagTag, setHashtagTag] = useState(() => {
    if (view === 'hashtag-feed' && routeParam) return routeParam;
    return null;
  });
  const [message, setMessage] = useState(null);
  const [storyCreatorOpen, setStoryCreatorOpen] = useState(false);
  const [storyViewerTarget, setStoryViewerTarget] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [leaguePromotion, setLeaguePromotion] = useState(null);
  const prevLeagueRef = useRef(null);

  useEffect(() => {
    if (view === 'public-profile' && routeParam) setPublicProfileUserId(routeParam);
    if (view === 'hashtag-feed' && routeParam) setHashtagTag(routeParam);
  }, [view, routeParam]);

  useSwipeNavigation(view, navigate, mainContentRef);

  useEffect(() => {
    if (!push.shouldPrompt || !useCloud) return;
    const timer = setTimeout(() => setShowPushPrompt(true), 8000);
    return () => clearTimeout(timer);
  }, [push.shouldPrompt, useCloud]);

  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    const count = useCloud ? (cloud.notifications?.length ?? 0) : 0;
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge?.().catch(() => {});
    }
  }, [useCloud, cloud.notifications?.length]);

  const handlePullRefresh = useCallback(async () => {
    if (view === 'home' && useCloud) {
      await Promise.all([cloud.refreshLeaderboard?.(), refreshProfile?.()]);
    } else if (view === 'feed' && useCloud) {
      await social.refreshFeed?.();
    } else if (view === 'challenges') {
      await challengesRefreshRef.current?.();
    } else if (view === 'stats' && useCloud) {
      await statsRefreshRef.current?.();
    } else if (view === 'profile' && useCloud) {
      await Promise.all([
        refreshProfile?.(),
        cloud.refreshCheckins?.(),
        social.loadFriends?.(),
        social.loadBadges?.()
      ]);
    }
  }, [view, useCloud, cloud, social, refreshProfile]);

  const { pullDistance, refreshing, pullRef } = usePullToRefresh(handlePullRefresh, {
    enabled: ['home', 'feed', 'challenges', 'profile', 'stats'].includes(view),
  });

  const openPublicProfile = useCallback((targetId) => {
    if (targetId === session?.user?.id) {
      navigate('profile');
      return;
    }
    setPublicProfileUserId(targetId);
    navigate('public-profile', targetId);
  }, [session?.user?.id, navigate]);

  const handleHashtagClick = useCallback((tag) => {
    setHashtagTag(tag);
    navigate('hashtag-feed', tag);
  }, [navigate]);

  const handleMentionClick = useCallback(async (username) => {
    if (!useCloud || !social.resolveUsername) return;
    const userId = await social.resolveUsername(username);
    if (userId) openPublicProfile(userId);
  }, [useCloud, social.resolveUsername, openPublicProfile]);

  const handleOpenStory = useCallback((userId) => {
    const ring = social.storiesRing ?? [];
    const userEntry = ring.find((s) => s.user_id === userId);
    if (userEntry) {
      setStoryViewerTarget(userEntry);
    }
  }, [social.storiesRing]);

  const handleStoryNextUser = useCallback(() => {
    const uid = session?.user?.id;
    const ring = (social.storiesRing ?? []).filter((s) => s.user_id !== uid);
    if (!storyViewerTarget || ring.length === 0) return;
    const currentIdx = ring.findIndex((s) => s.user_id === storyViewerTarget.user_id);
    if (currentIdx < ring.length - 1) {
      setStoryViewerTarget(ring[currentIdx + 1]);
    } else {
      setStoryViewerTarget(null);
    }
  }, [social.storiesRing, storyViewerTarget, session?.user?.id]);

  const handleStoryPrevUser = useCallback(() => {
    const uid = session?.user?.id;
    const ring = (social.storiesRing ?? []).filter((s) => s.user_id !== uid);
    if (!storyViewerTarget || ring.length === 0) return;
    const currentIdx = ring.findIndex((s) => s.user_id === storyViewerTarget.user_id);
    if (currentIdx > 0) {
      setStoryViewerTarget(ring[currentIdx - 1]);
    }
  }, [social.storiesRing, storyViewerTarget, session?.user?.id]);

  useEffect(() => {
    if (!useCloud) {
      saveFitRankState({ userData, checkins });
    }
  }, [useCloud, userData, checkins]);

  const LEAGUE_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  useEffect(() => {
    const currentLeague = profile?.league;
    if (!currentLeague) return;
    const prev = prevLeagueRef.current;
    prevLeagueRef.current = currentLeague;
    if (prev && prev !== currentLeague) {
      const prevIdx = LEAGUE_ORDER.indexOf(prev);
      const currIdx = LEAGUE_ORDER.indexOf(currentLeague);
      if (currIdx > prevIdx) {
        setLeaguePromotion(currentLeague);
        analytics.leaguePromoted({ from_league: prev, to_league: currentLeague });
      }
    }
  }, [profile?.league]);

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
  const displayLeaderboard = useCloud ? cloud.leaderboardTop : localLeaderboard;
  const myRankUser = useCloud ? cloud.myLeaderboardEntry : null;
  const myLeagueRankUser = useCloud ? cloud.myLeagueLeaderboardEntry : null;

  const localUser = useMemo(() => ({ uid: displayUserData.uid }), [displayUserData.uid]);

  const showToast = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCheckin = async (workoutType = 'Treino Geral', fotoFile = null, feedVisible = true, feedCaption = null, extras = {}) => {
    analytics.checkinStarted();
    if (useCloud) {
      try {
        const prevLevel = calculateLevel(profile?.xp ?? 0);
        const prevStreak = profile?.streak ?? 0;
        const prevBadgeCount = social.badges?.length ?? 0;

        analytics.checkinSubmitted({ workout_type: workoutType });
        await cloud.insertCheckin(workoutType, fotoFile, feedVisible, feedCaption, extras);

        const freshProfile = await refreshProfile?.();
        const newXp = freshProfile?.xp ?? profile?.xp ?? 0;
        const newLevel = calculateLevel(newXp);
        const newStreak = freshProfile?.streak ?? prevStreak;

        let newBadges = [];
        try {
          const badgeRes = await social.loadBadges?.(session?.user?.id);
          if (Array.isArray(badgeRes)) {
            const unlocked = badgeRes.filter((b) => b.unlocked_at);
            if (unlocked.length > prevBadgeCount) {
              newBadges = unlocked.slice(prevBadgeCount).map((b) => b.name);
            }
          }
        } catch { /* ignore */ }

        setCelebration({
          points: 10,
          workoutType,
          streak: newStreak,
          leveledUp: newLevel > prevLevel,
          newLevel: newLevel > prevLevel ? newLevel : undefined,
          badges: newBadges.length > 0 ? newBadges : undefined
        });
        analytics.checkinSuccess({
          points: 10,
          workout_type: workoutType,
          streak_day: newStreak,
          leveled_up: newLevel > prevLevel
        });
        setTimerDuration(null);
        navigate('home');
      } catch (err) {
        analytics.checkinError(err.message);
        throw err;
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
    setTimerDuration(null);
    navigate('home');
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

  if (configured && session && profile && !profile.onboarding_completed_at) {
    return <OnboardingWizard />;
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-green-500/30 overflow-x-hidden">
      <div ref={(el) => { mainContentRef.current = el; pullRef.current = el; }} className="max-w-lg mx-auto px-4 pt-8 pb-24 min-h-screen safe-top">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-3">
            {canGoBack && (
              <button
                type="button"
                onClick={goBack}
                aria-label="Voltar"
                className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center hover:bg-zinc-800 transition-colors active:scale-90"
              >
                <ArrowLeft size={20} className="text-zinc-400" aria-hidden="true" />
              </button>
            )}
            <h1 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600 uppercase">
              FitRank
            </h1>
          </div>
          <button
            type="button"
            onClick={() => navigate('notifications')}
            aria-label="Notificações"
            className="relative w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center hover:bg-zinc-800 transition-colors"
          >
            <Bell size={20} className={view === 'notifications' ? 'text-white' : 'text-zinc-400'} aria-hidden="true" />
            {useCloud && cloud.notifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white px-1">
                {cloud.notifications.length > 9 ? '9+' : cloud.notifications.length}
              </span>
            )}
          </button>
        </div>

        <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} />

        <Suspense fallback={<ViewSkeleton />}>
        <AnimatedViewContainer currentView={view} direction={transitionDir}>
        {view === 'home' && (
          <HomeView
            user={localUser}
            userData={displayUserData}
            topUsers={displayLeaderboard}
            myRankUser={myRankUser}
            rankingLoading={useCloud && (cloud.leaderboardLoading || cloud.loading)}
            rankingFilterEnabled={useCloud}
            rankingPeriod={cloud.rankingPeriod}
            onRankingPeriodChange={cloud.setRankingPeriod}
            rankingPeriodLabel={cloud.rankingPeriodLabel}
            leagueTopUsers={useCloud ? cloud.leagueLeaderboardTop : []}
            myLeagueRankUser={myLeagueRankUser}
            leagueLoading={useCloud ? cloud.leagueLoading : false}
            onLoadLeagueRanking={useCloud ? cloud.refreshLeagueRanking : undefined}
            onOpenCheckin={() => navigate('checkin-modal')}
            onOpenTimer={() => navigate('timer')}
            onOpenProfile={useCloud ? openPublicProfile : undefined}
            onCheckStreakRecovery={useCloud ? cloud.checkStreakRecovery : undefined}
            onRecoverStreak={useCloud ? cloud.recoverStreak : undefined}
            onGetBoostStatus={useCloud ? cloud.getBoostStatus : undefined}
            onPurchaseBoost={useCloud ? cloud.purchaseBoost : undefined}
          />
        )}
        {view === 'feed' && useCloud && (
          <FeedView
            feed={social.feed}
            feedLoading={social.feedLoading}
            feedHasMore={social.feedHasMore}
            feedMode={social.feedMode}
            onFeedModeChange={social.setFeedMode}
            onLoadFeed={social.loadFeed}
            onLoadMoreFeed={social.loadMoreFeed}
            onRefreshFeed={social.refreshFeed}
            onToggleLike={social.toggleLike}
            onAddComment={social.addComment}
            onLoadComments={social.loadComments}
            onDeleteComment={social.deleteComment}
            onLoadLikes={social.loadLikes}
            onOpenFriends={() => navigate('friends')}
            onOpenProfile={useCloud ? openPublicProfile : undefined}
            currentUserId={localUser?.uid}
            onUpdatePrivacy={social.updatePostPrivacy}
            onDeletePost={social.deletePost}
            onTrackShare={social.trackShare}
            onTrackImpression={social.trackImpression}
            onMentionClick={handleMentionClick}
            onHashtagClick={handleHashtagClick}
            trendingHashtags={social.trendingHashtags}
            onLoadTrendingHashtags={social.loadTrendingHashtags}
            storiesRing={social.storiesRing}
            onLoadStoriesRing={social.loadStoriesRing}
            onOpenStory={handleOpenStory}
            onCreateStory={() => setStoryCreatorOpen(true)}
            selfAvatarUrl={profile?.avatar_url}
          />
        )}
        {view === 'challenges' && <ChallengesView onRegisterRefresh={(fn) => { challengesRefreshRef.current = fn; }} />}
        {view === 'profile' && (
          <ProfileView
            userData={displayUserData}
            checkins={displayCheckins}
            cloudTenant={tenant}
            cloudDisplayName={profile?.display_name}
            isPlatformMaster={profile?.is_platform_master}
            onOpenAdmin={profile?.is_platform_master ? () => navigate('admin-tenants') : undefined}
            onOpenChallenges={profile?.is_platform_master ? () => navigate('admin-challenges') : undefined}
            onOpenUsers={profile?.is_platform_master ? () => navigate('admin-users') : undefined}
            onOpenModeration={profile?.is_platform_master ? () => navigate('admin-moderation') : undefined}
            onOpenModerationSettings={
              profile?.is_platform_master ? () => navigate('admin-moderation-settings') : undefined
            }
            onOpenEngagement={profile?.is_platform_master ? () => navigate('admin-engagement') : undefined}
            onOpenAudit={profile?.is_platform_master ? () => navigate('admin-audit') : undefined}
            onOpenBilling={profile?.is_platform_master ? () => navigate('admin-billing') : undefined}
            onOpenObservability={profile?.is_platform_master ? () => navigate('admin-observability') : undefined}
            onEditProfile={useCloud ? () => navigate('edit-profile') : undefined}
            onRetryCheckin={useCloud ? cloud.retryCheckin : undefined}
            onOpenFriends={useCloud ? () => navigate('friends') : undefined}
            friends={useCloud ? social.friends : []}
            friendsLoading={useCloud ? social.friendsLoading : false}
            onLoadFriends={useCloud ? social.loadFriends : undefined}
            onRemoveFriend={useCloud ? social.removeFriend : undefined}
            onOpenProfile={useCloud ? openPublicProfile : undefined}
            badges={useCloud ? social.badges : []}
            badgesLoading={useCloud ? social.badgesLoading : false}
            onLoadBadges={useCloud ? social.loadBadges : undefined}
            checkinPage={useCloud ? cloud.checkinPage : 0}
            checkinLimit={useCloud ? cloud.checkinLimit : 0}
            checkinCount={useCloud ? cloud.checkinCount : 0}
            checkinApprovedCount={useCloud ? cloud.checkinApprovedCount : undefined}
            checkinsLoading={useCloud ? cloud.checkinsLoading : false}
            onPageChange={useCloud ? cloud.setCheckinPage : undefined}
            onLimitChange={useCloud ? cloud.setCheckinLimit : undefined}
            onSignOut={configured ? signOut : undefined}
            onOpenProgress={() => navigate('progress')}
            onOpenStats={() => navigate('stats')}
            onOpenPlan={() => navigate('workout-plan')}
            onGeneratePlan={() => navigate('workout-plan-generator')}
            onOpenPushSettings={useCloud ? () => navigate('push-settings') : undefined}
          />
        )}
        {view === 'edit-profile' && useCloud && (
          <EditProfileView
            profile={profile}
            onBack={goBack}
            onUploadAvatar={cloud.uploadAvatar}
            onUpdateProfile={cloud.updateProfile}
            onCheckUsername={cloud.checkUsernameAvailable}
            onUpdatePassword={cloud.updatePassword}
          />
        )}
        {view === 'push-settings' && useCloud && (
          <Suspense fallback={<ViewSkeleton />}>
            <PushPreferencesView
              supabase={supabase}
              userId={session?.user?.id}
              onBack={goBack}
              push={push}
            />
          </Suspense>
        )}
        {view === 'progress' && useCloud && (
          <Suspense fallback={<ViewSkeleton />}>
            <ProgressView onBack={goBack} />
          </Suspense>
        )}
        {view === 'stats' && useCloud && (
          <Suspense fallback={<ViewSkeleton />}>
            <StatsView onBack={goBack} friends={social.friends} refreshRef={statsRefreshRef} />
          </Suspense>
        )}
        {view === 'workout-plan' && useCloud && (
          <Suspense fallback={<ViewSkeleton />}>
            <WorkoutPlanView
              onBack={goBack}
              onOpenTimer={(restSec) => {
                workoutTimer.prepareRestFromPlan(restSec);
                navigate('timer');
              }}
              onGenerateNew={() => navigate('workout-plan-generator')}
            />
          </Suspense>
        )}
        {view === 'workout-plan-generator' && useCloud && (
          <Suspense fallback={<ViewSkeleton />}>
            <WorkoutPlanGeneratorView
              onBack={goBack}
              onPlanGenerated={() => navigate('workout-plan')}
            />
          </Suspense>
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
            onCancelSentRequest={social.cancelSentFriendRequest}
            onAccept={social.acceptFriendRequest}
            onDecline={social.declineFriendRequest}
            onRemove={social.removeFriend}
            onOpenProfile={openPublicProfile}
            onBack={goBack}
          />
        )}
        {view === 'hashtag-feed' && hashtagTag && useCloud && (
          <HashtagFeedView
            tag={hashtagTag}
            onBack={goBack}
            onToggleLike={social.toggleLike}
            onAddComment={social.addComment}
            onLoadComments={social.loadComments}
            onDeleteComment={social.deleteComment}
            onLoadLikes={social.loadLikes}
            onOpenProfile={openPublicProfile}
            currentUserId={localUser?.uid}
            onUpdatePrivacy={social.updatePostPrivacy}
            onDeletePost={social.deletePost}
            onTrackShare={social.trackShare}
            onMentionClick={handleMentionClick}
            onHashtagClick={handleHashtagClick}
          />
        )}
        {view === 'public-profile' && publicProfileUserId && useCloud && (
          <PublicProfileView
            userId={publicProfileUserId}
            onBack={goBack}
            onSendFriendRequest={social.sendFriendRequest}
            onRemoveFriend={social.removeFriend}
            onCancelSentFriendRequest={social.cancelSentFriendRequest}
            onToggleLike={social.toggleLike}
            onAddComment={social.addComment}
            onLoadComments={social.loadComments}
            onDeleteComment={social.deleteComment}
            onLoadLikes={social.loadLikes}
            currentUserId={localUser?.uid}
            onUpdatePrivacy={social.updatePostPrivacy}
            onDeletePost={social.deletePost}
            onLoadBadges={social.loadBadges}
          />
        )}
        {view === 'admin-tenants' && profile?.is_platform_master && (
          <AdminTenantsView onBack={goBack} />
        )}
        {view === 'admin-challenges' && profile?.is_platform_master && (
          <AdminChallengesView onBack={goBack} />
        )}
        {view === 'admin-moderation' && profile?.is_platform_master && (
          <AdminModerationView onBack={goBack} />
        )}
        {view === 'admin-moderation-settings' && profile?.is_platform_master && (
          <AdminModerationSettingsView onBack={goBack} />
        )}
        {view === 'admin-users' && profile?.is_platform_master && (
          <AdminUsersView onBack={goBack} />
        )}
        {view === 'admin-engagement' && profile?.is_platform_master && (
          <AdminEngagementView onBack={goBack} />
        )}
        {view === 'admin-audit' && profile?.is_platform_master && (
          <AdminAuditView onBack={goBack} />
        )}
        {view === 'admin-billing' && profile?.is_platform_master && (
          <AdminBillingView onBack={goBack} />
        )}
        {view === 'admin-observability' && profile?.is_platform_master && (
          <AdminObservabilityView onBack={goBack} />
        )}

        {view === 'notifications' && useCloud && (
          <NotificationsView
            notifications={cloud.notifications}
            readNotifications={cloud.readNotifications}
            onMarkAllRead={cloud.markAllNotificationsRead}
            onBack={goBack}
            onItemClick={(n) => {
              if (n.type === 'training_reminder') navigate('checkin-modal');
              else if (n.type === 'friend_request' || n.type === 'friend_accepted') navigate('friends');
            }}
          />
        )}

        </AnimatedViewContainer>
        </Suspense>

        {view === 'timer' && (
          <Suspense fallback={<ViewSkeleton />}>
            <WorkoutTimerView
              onClose={() => navigate('home')}
              onFinish={(sec) => {
                setTimerDuration(sec);
                navigate('checkin-modal');
              }}
              timerHook={workoutTimer}
            />
          </Suspense>
        )}

        {view === 'checkin-modal' && (
          <Suspense fallback={null}>
            <CheckinModal
              onClose={() => { setTimerDuration(null); navigate('home'); }}
              onCheckin={handleCheckin}
              friends={useCloud ? social.friends : []}
              prefillDuration={timerDuration}
            />
          </Suspense>
        )}

        {storyCreatorOpen && useCloud && (
          <Suspense fallback={null}>
            <StoryCreator
              onClose={() => setStoryCreatorOpen(false)}
              onCreateStory={social.createStory}
            />
          </Suspense>
        )}

        {storyViewerTarget && useCloud && (
          <Suspense fallback={null}>
          <StoryViewer
            userId={storyViewerTarget.user_id}
            displayName={storyViewerTarget.display_name}
            avatarUrl={storyViewerTarget.avatar_url}
            storiesRing={social.storiesRing}
            loadUserStories={social.loadUserStories}
            onMarkViewed={social.markStoryViewed}
            onDeleteStory={social.deleteStory}
            onLoadViewers={social.loadStoryViewers}
            onClose={() => { setStoryViewerTarget(null); social.loadStoriesRing(); }}
            onNextUser={handleStoryNextUser}
            onPrevUser={handleStoryPrevUser}
            onOpenProfile={openPublicProfile}
            currentUserId={localUser?.uid}
          />
          </Suspense>
        )}

        <CelebrationOverlay
          celebration={celebration}
          onDismiss={() => setCelebration(null)}
        />

        {leaguePromotion && (
          <LeaguePromotionOverlay
            league={leaguePromotion}
            onClose={() => setLeaguePromotion(null)}
          />
        )}

        <SwUpdateToast />
        <InstallPrompt />

        <PushPermissionPrompt
          open={showPushPrompt}
          onAccept={async () => {
            setShowPushPrompt(false);
            await push.requestPermission();
          }}
          onDismiss={() => {
            setShowPushPrompt(false);
            push.dismissPrompt();
          }}
        />

        {message && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-black px-6 py-3 rounded-full font-bold shadow-xl shadow-green-500/20 flex items-center gap-2 animate-in-toast">
            <Zap size={18} />
            {message}
          </div>
        )}

        {view !== 'timer' && (
          <MiniTimer timerHook={workoutTimer} onClick={() => navigate('timer')} />
        )}

        <nav aria-label="Menu principal" className="fixed bottom-0 left-0 right-0 bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-800 px-6 flex items-center justify-between z-40 max-w-lg mx-auto safe-bottom" style={{ height: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
          <button
            type="button"
            onClick={() => navigate('home')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              view === 'home' ? 'text-white' : 'text-zinc-600'
            }`}
          >
            <Home size={24} className={view === 'home' ? 'fill-white/10' : ''} />
            <span className="text-[10px] font-bold uppercase">Home</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('feed')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              view === 'feed' ? 'text-white' : 'text-zinc-600'
            }`}
          >
            <Newspaper size={24} className={view === 'feed' ? 'fill-white/10' : ''} />
            <span className="text-[10px] font-bold uppercase">Feed</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('checkin-modal')}
            aria-label="Registrar treino"
            className="flex flex-col items-center -mt-10"
          >
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/40 active:scale-90 transition-transform">
              <Plus size={32} className="text-black" aria-hidden="true" />
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate('challenges')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              view === 'challenges' ? 'text-white' : 'text-zinc-600'
            }`}
          >
            <TrendingUp size={24} />
            <span className="text-[10px] font-bold uppercase">Desafios</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('profile')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              view === 'profile' ? 'text-white' : 'text-zinc-600'
            }`}
          >
            <User size={24} className={view === 'profile' ? 'fill-white/10' : ''} />
            <span className="text-[10px] font-bold uppercase">Perfil</span>
          </button>
        </nav>
      </div>

      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 opacity-30">
        <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-500/5 blur-[100px]" />
      </div>
    </div>
  );
}
