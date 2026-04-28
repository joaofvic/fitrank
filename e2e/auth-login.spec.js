import { test, expect } from '@playwright/test';
import { setupE2EHomeRestStubs, E2E_BASE_URL } from './helpers/supabase-e2e-setup.js';

const BASE_URL = E2E_BASE_URL;

async function stubAuthAfterSetSession(page, userId) {
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'e2e@example.com',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
      }),
    });
  });

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
        id: userId,
        tenant_id: '00000000-0000-0000-0000-0000000000e2',
        league: 'bronze',
        xp: 0,
        pontos: 0,
        is_pro: false,
        display_name: 'E2E',
        onboarding_completed_at: new Date().toISOString(),
        tenants: { slug: 'e2e', name: 'E2E', status: 'active' },
      }),
    });
  });
}

test.describe('Auth-login (email/username/telefone)', () => {
  test('login chama Edge Function com identifier', async ({ page }) => {
    const userId = '00000000-0000-0000-0000-00000000e2e0';
    await stubAuthAfterSetSession(page, userId);
    await setupE2EHomeRestStubs(page);

    let lastBody = null;
    await page.route('**/functions/v1/auth-login', async (route) => {
      lastBody = route.request().postDataJSON?.() ?? null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          access_token: 'e2e-access-token',
          refresh_token: 'e2e-refresh-token',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: userId, email: 'e2e@example.com' },
        }),
      });
    });

    await page.goto(BASE_URL);

    await page.getByLabel(/Número de celular, nome de usuário ou email/i).fill('(11) 9 1234-5678');
    await page.getByLabel(/Senha/i).fill('123456');
    await page.getByRole('button', { name: /^Entrar$/i }).click();

    await expect.poll(() => lastBody).not.toBeNull();
    expect(lastBody.identifier).toBe('(11) 9 1234-5678');
    expect(lastBody.password).toBe('123456');
  });

  test('falha retorna mensagem genérica (anti-enumeração)', async ({ page }) => {
    await setupE2EHomeRestStubs(page);

    await page.route('**/functions/v1/auth-login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Credenciais inválidas' }),
      });
    });

    await page.goto(BASE_URL);
    await page.getByLabel(/Número de celular, nome de usuário ou email/i).fill('usuario_inexistente');
    await page.getByLabel(/Senha/i).fill('123456');
    await page.getByRole('button', { name: /^Entrar$/i }).click();

    await expect(page.getByRole('alert')).toContainText(/Credenciais inválidas/i);
  });
});

