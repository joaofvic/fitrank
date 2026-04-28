/**
 * Login falso + mock REST mínimo para E2E com Supabase configurado no .env.
 * A chave de sessão deve corresponder ao project ref da `VITE_SUPABASE_URL` (ex.: pjlmemvwqhmpchiiqtol).
 */

export const E2E_BASE_URL = 'http://localhost:3000/';

/** Ref do projeto na URL `https://<ref>.supabase.co` — alinhar com `.env` local/CI. */
export const E2E_SUPABASE_PROJECT_REF = 'pjlmemvwqhmpchiiqtol';

export const E2E_AUTH_STORAGE_KEY = `sb-${E2E_SUPABASE_PROJECT_REF}-auth-token`;

export function buildSession(userId) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    access_token: 'e2e-access-token',
    refresh_token: 'e2e-refresh-token',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 30,
    expires_at: nowSec + 60 * 60 * 24 * 30,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'e2e@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: new Date().toISOString()
    }
  };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ userId: string, profile: object, rankingHandlers?: Record<string, (route: import('@playwright/test').Route) => Promise<void>> }} opts
 */
export async function setupE2EAuthAndMocks(page, { userId, profile, rankingHandlers = {} }) {
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, { key: E2E_AUTH_STORAGE_KEY, value: JSON.stringify(buildSession(userId)) });

  await page.route('**/rest/v1/profiles**', async (route) => {
    const url = new URL(route.request().url());
    const select = url.searchParams.get('select') || '';
    const isProfileRow = select.includes('tenant_id') && url.searchParams.get('id') === `eq.${userId}`;
    if (!isProfileRow) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...profile,
        id: userId,
        tenants: { slug: 'e2e', name: 'E2E', status: 'active' }
      })
    });
  });

  for (const [pattern, handler] of Object.entries(rankingHandlers)) {
    await page.route(pattern, handler);
  }

  await setupE2EHomeRestStubs(page);
}

/** Evita chamadas reais a checkins/notifications no carregamento da home. */
export async function setupE2EHomeRestStubs(page) {
  await page.route('**/rest/v1/checkins**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0--1/0' },
      body: '[]'
    });
  });
  await page.route('**/rest/v1/notifications**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}
