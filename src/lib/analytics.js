import { posthog } from './posthog.js';

function getPlatform() {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return 'pwa';
  if (/Android/i.test(navigator.userAgent)) return 'android-web';
  if (/iP(hone|od|ad)/i.test(navigator.userAgent)) return 'ios-web';
  return 'web';
}

export function track(event, properties = {}) {
  if (!posthog?.capture) return;
  posthog.capture(event, {
    platform: getPlatform(),
    ...properties
  });
}

export const analytics = {
  // -- Check-in funnel --
  checkinStarted: () => track('checkin_started'),
  checkinPhotoSelected: () => track('checkin_photo_selected'),
  checkinSubmitted: (props) => track('checkin_submitted', props),
  checkinSuccess: (props) => track('checkin_success', props),
  checkinError: (errorType) => track('checkin_error', { error_type: errorType }),

  // -- Social --
  socialLike: (checkinId) => track('social_like', { checkin_id: checkinId }),
  socialUnlike: (checkinId) => track('social_unlike', { checkin_id: checkinId }),
  socialCommentAdded: (checkinId) => track('social_comment_added', { checkin_id: checkinId }),
  socialShare: (platform) => track('social_share', { share_platform: platform }),
  socialStoryCreated: () => track('social_story_created'),
  socialStoryViewed: (authorId) => track('social_story_viewed', { author_id: authorId }),
  socialFriendRequestSent: () => track('social_friend_request_sent'),
  socialFriendAccepted: () => track('social_friend_accepted'),
  socialMentionUsed: () => track('social_mention_used'),

  // -- Gamification --
  badgeUnlocked: (props) => track('gamification_badge_unlocked', props),
  levelUp: (props) => track('gamification_level_up', props),
  leaguePromoted: (props) => track('gamification_league_promoted', props),
  streakRecovery: (props) => track('gamification_streak_recovery', props),
  boostPurchased: (props) => track('gamification_boost_purchased', props),

  // -- Auth --
  authLogin: () => track('auth_login'),
  authSignup: () => track('auth_signup'),
  authLogout: () => track('auth_logout'),
  authPasswordReset: () => track('auth_password_reset_requested'),

  // -- Onboarding --
  onboardingStarted: () => track('onboarding_started'),
  onboardingStepCompleted: (props) => track('onboarding_step_completed', props),
  onboardingStepSkipped: (props) => track('onboarding_step_skipped', props),
  onboardingCompleted: () => track('onboarding_completed'),

  // -- PWA --
  pwaInstallPrompted: () => track('pwa_install_prompted'),
  pwaInstalled: () => track('pwa_installed'),
  pwaInstallDismissed: () => track('pwa_install_dismissed')
};
