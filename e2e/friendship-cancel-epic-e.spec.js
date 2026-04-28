import { test, expect } from '@playwright/test';

/**
 * Epic E (@.cursor/plans/cancelar_solicitação_amizade): smoke mínimo + matriz QA no plano.
 * Fluxos com duas sessões/dispositivos e APIs reais permanecem em QA manual.
 */
test.describe('Epic E — cancelamento de solicitações (baseline)', () => {
  test('shell carrega (pré-compute para cenários QA manuais da matriz)', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await expect(page).toHaveTitle(/FitRank/i);
  });
});
