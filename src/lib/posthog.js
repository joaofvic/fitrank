import posthog from 'posthog-js';

const apiKey = import.meta.env.VITE_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let initialized = false;

export function initPostHog() {
  if (!apiKey || initialized) return;

  posthog.init(apiKey, {
    api_host: apiHost,
    autocapture: true,
    capture_pageview: false,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    disable_session_recording: false,
    mask_all_text: false,
    mask_all_element_attributes: false,
    session_recording: {
      maskInputOptions: { password: true, email: true },
      maskTextSelector: '[data-ph-mask]',
      recordCrossOriginIframes: false,
      sampleRate: 0.1,
      errorSampleRate: 1.0
    }
  });

  initialized = true;
}

export function identifyUser(profile, tenant) {
  if (!initialized || !profile?.id) return;

  posthog.identify(profile.id, {
    username: profile.username,
    display_name: profile.display_name,
    tenant_id: profile.tenant_id,
    is_pro: profile.is_pro,
    is_master: !!profile.is_platform_master
  });

  if (profile.tenant_id && tenant) {
    posthog.group('tenant', profile.tenant_id, {
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status
    });
  }
}

export function resetUser() {
  if (!initialized) return;
  posthog.reset();
}

export function capturePageView(viewName, path) {
  if (!initialized) return;
  posthog.capture('$pageview', {
    $current_url: window.location.origin + path,
    view_name: viewName
  });
}

export { posthog };
