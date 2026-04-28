import { test, expect } from '@playwright/test';
import { setupE2EAuthAndMocks, E2E_BASE_URL } from './helpers/supabase-e2e-setup.js';

const minimalRankingHandlers = {
  '**/rest/v1/rpc/get_tenant_leaderboard_top_period*': async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  },
  '**/rest/v1/rpc/get_my_tenant_rank_period*': async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  },
  '**/rest/v1/rpc/get_league_leaderboard_top*': async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  },
  '**/rest/v1/rpc/get_my_league_rank_period*': async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  }
};

test.describe('Timer (smoke E2E)', () => {
  test('abre timer a partir da home, alterna para Descanso com treino pausado e mantém resumo Treino ·', async ({ page }) => {
    const userId = '00000000-0000-0000-0000-00000000e2e01';

    await setupE2EAuthAndMocks(page, {
      userId,
      profile: {
        tenant_id: '00000000-0000-0000-0000-0000000000e2',
        league: 'bronze',
        xp: 100,
        pontos: 10,
        is_pro: false,
        display_name: 'E2E Timer',
        onboarding_completed_at: new Date().toISOString()
      },
      rankingHandlers: minimalRankingHandlers
    });

    await page.goto(E2E_BASE_URL);

    await page.getByRole('button', { name: /timer de treino/i }).click();

    await expect(page.getByRole('heading', { name: /^Timer$/i })).toBeVisible();
    await expect(page.getByRole('tablist', { name: /modo do timer/i })).toBeVisible();

    await page.getByRole('button', { name: /Iniciar cronômetro de treino/i }).click();
    await page.waitForTimeout(2000);

    await page.getByRole('tab', { name: /^Descanso$/i }).click();

    await expect(page.getByText(/Treino pausado ao mudar para Descanso/i)).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole('tabpanel', { name: /^Descanso$/i })).toBeVisible();
    await expect(page.getByText(/Treino ·/)).toBeVisible();

    const summary = page.locator('p.text-sm').filter({ hasText: 'Treino ·' });
    await expect(summary).not.toContainText('Treino · 0:00');

    await page.getByRole('tab', { name: /^Cronômetro$/i }).click();
    await expect(page.getByRole('tabpanel', { name: /^Cronômetro$/i })).toBeVisible();
  });
});
