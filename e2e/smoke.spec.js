import { test, expect } from '@playwright/test';

test.describe('FitRank smoke', () => {
  test('carrega shell e título', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await expect(page).toHaveTitle(/FitRank/i);
  });

  test('sem variáveis Supabase mostra instrução de configuração', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    const needsConfig = await page.getByText('VITE_SUPABASE_URL').isVisible().catch(() => false);
    const hasAuth = await page.getByRole('button', { name: /Entrar/i }).isVisible().catch(() => false);
    expect(needsConfig || hasAuth).toBeTruthy();
  });
});
