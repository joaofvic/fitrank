import { test, expect } from '@playwright/test';
import { setupE2EAuthAndMocks, E2E_BASE_URL } from './helpers/supabase-e2e-setup.js';

const BASE_URL = E2E_BASE_URL;

function challengesRpcPattern(name) {
  return `**/rest/v1/rpc/${name}*`;
}

function buildChallenge({ id, is_enrolled, is_full = false, daysOffsetStart = -1, daysOffsetEnd = 1 }) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() + daysOffsetStart);
  const end = new Date(today);
  end.setDate(today.getDate() + daysOffsetEnd);

  const toISODate = (d) => d.toISOString().slice(0, 10);

  return {
    id,
    nome: 'Desafio E2E',
    descricao: 'Teste',
    data_inicio: toISODate(start),
    data_fim: toISODate(end),
    tipo_treino: [],
    reward_winners_count: 3,
    reward_distribution_type: 'equal',
    entry_fee: 0,
    is_enrolled,
    is_full
  };
}

async function goToChallenges(page) {
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: /^Desafios$/i }).click();
  await expect(page.getByRole('heading', { name: /^Desafios$/i })).toBeVisible({ timeout: 15_000 });
}

test.describe('Desafios: ranking privado', () => {
  test('não participante: vê apenas Top 3 enquanto ativo (e sem contagem)', async ({ page }) => {
    const userId = '00000000-0000-0000-0000-00000000a001';
    const tenantId = '00000000-0000-0000-0000-0000000000e2';
    const desafioId = '00000000-0000-0000-0000-00000000d001';

    const challenge = buildChallenge({ id: desafioId, is_enrolled: false, daysOffsetStart: -1, daysOffsetEnd: 2 });
    const top3 = Array.from({ length: 3 }).map((_, i) => ({
      user_id: `00000000-0000-0000-0000-00000000b00${i}`,
      nome_exibicao: `Top ${i + 1}`,
      pontos_desafio: 100 - i,
      is_me: false,
      avatar_url: null,
      rank: i + 1
    }));

    await setupE2EAuthAndMocks(page, {
      userId,
      profile: {
        tenant_id: tenantId,
        league: 'bronze',
        xp: 1,
        pontos: 1,
        is_pro: false,
        display_name: 'Eu',
        onboarding_completed_at: new Date().toISOString()
      },
      rankingHandlers: {
        [challengesRpcPattern('get_challenges_with_counts')]: async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([challenge]) });
        },
        [challengesRpcPattern('get_desafio_ranking_public')]: async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(top3) });
        }
      }
    });

    await goToChallenges(page);
    await page.getByRole('button', { name: /Ver ranking/i }).click();

    const rankingSection = page.locator('div', {
      has: page.getByRole('heading', { name: /Ranking do desafio/i })
    });
    const list = rankingSection.getByRole('list');
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(list.getByText('Top 1')).toBeVisible();
    await expect(list.getByText('Top 2')).toBeVisible();
    await expect(list.getByText('Top 3')).toBeVisible();
    await expect(list.getByText('Top 4')).toHaveCount(0);

    // Não deve exibir contagem de participantes em lugar algum do card
    await expect(page.getByText(/participante/i)).toHaveCount(0);
  });

  test('não participante: desafio inativo não carrega ranking e mostra mensagem', async ({ page }) => {
    const userId = '00000000-0000-0000-0000-00000000a002';
    const tenantId = '00000000-0000-0000-0000-0000000000e2';
    const desafioId = '00000000-0000-0000-0000-00000000d002';

    // ended yesterday
    const challenge = buildChallenge({ id: desafioId, is_enrolled: false, daysOffsetStart: -10, daysOffsetEnd: -1 });

    let publicCalled = 0;
    await setupE2EAuthAndMocks(page, {
      userId,
      profile: {
        tenant_id: tenantId,
        league: 'bronze',
        xp: 1,
        pontos: 1,
        is_pro: false,
        display_name: 'Eu',
        onboarding_completed_at: new Date().toISOString()
      },
      rankingHandlers: {
        [challengesRpcPattern('get_challenges_with_counts')]: async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([challenge]) });
        },
        [challengesRpcPattern('get_desafio_ranking_public')]: async (route) => {
          publicCalled += 1;
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        }
      }
    });

    await goToChallenges(page);
    await page.getByRole('button', { name: /Ver ranking/i }).click();

    await expect(page.getByText(/Ranking disponível apenas durante o desafio/i)).toBeVisible();
    expect(publicCalled).toBe(0);
  });

  test('participante: vê apenas janela (1 acima/eu/1 abaixo) e “Sua posição”', async ({ page }) => {
    const userId = '00000000-0000-0000-0000-00000000a003';
    const tenantId = '00000000-0000-0000-0000-0000000000e2';
    const desafioId = '00000000-0000-0000-0000-00000000d003';

    const challenge = buildChallenge({ id: desafioId, is_enrolled: true, daysOffsetStart: -1, daysOffsetEnd: 2 });
    const windowRows = [
      { user_id: '00000000-0000-0000-0000-00000000c001', nome_exibicao: 'Acima', pontos_desafio: 11, is_me: false, avatar_url: null, rank: 4, my_rank: 5 },
      { user_id: userId, nome_exibicao: 'Eu', pontos_desafio: 10, is_me: true, avatar_url: null, rank: 5, my_rank: 5 },
      { user_id: '00000000-0000-0000-0000-00000000c003', nome_exibicao: 'Abaixo', pontos_desafio: 9, is_me: false, avatar_url: null, rank: 6, my_rank: 5 }
    ];

    await setupE2EAuthAndMocks(page, {
      userId,
      profile: {
        tenant_id: tenantId,
        league: 'bronze',
        xp: 1,
        pontos: 1,
        is_pro: false,
        display_name: 'Eu',
        onboarding_completed_at: new Date().toISOString()
      },
      rankingHandlers: {
        [challengesRpcPattern('get_challenges_with_counts')]: async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([challenge]) });
        },
        [challengesRpcPattern('get_my_desafio_ranking_window')]: async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(windowRows) });
        }
      }
    });

    await goToChallenges(page);
    await page.getByRole('button', { name: /Ver ranking/i }).click();

    await expect(page.getByText(/Sua posição/i)).toBeVisible();
    await expect(page.getByText(/Sua posição:\s*#5/i)).toBeVisible();

    const rankingSection = page.locator('div', {
      has: page.getByRole('heading', { name: /Ranking do desafio/i })
    });
    const list = rankingSection.getByRole('list');
    await expect(list.getByText('Acima')).toBeVisible();
    await expect(list.getByRole('listitem').filter({ hasText: 'Eu' })).toHaveCount(1);
    await expect(list.getByText('Abaixo')).toBeVisible();
    await expect(list.getByText('Outro')).toHaveCount(0);
  });

  test('participante ativo: consegue abrir ranking completo', async ({ page }) => {
    const userId = '00000000-0000-0000-0000-00000000a004';
    const tenantId = '00000000-0000-0000-0000-0000000000e2';
    const desafioId = '00000000-0000-0000-0000-00000000d004';

    const challenge = buildChallenge({ id: desafioId, is_enrolled: true, daysOffsetStart: -1, daysOffsetEnd: 2 });
    const windowRows = [
      { user_id: userId, nome_exibicao: 'Eu', pontos_desafio: 10, is_me: true, avatar_url: null, rank: 2, my_rank: 2 }
    ];
    const fullRows = Array.from({ length: 6 }).map((_, i) => ({
      user_id: `00000000-0000-0000-0000-00000000f00${i}`,
      nome_exibicao: `Full ${i + 1}`,
      pontos_desafio: 200 - i,
      is_me: i === 1,
      avatar_url: null,
      rank: i + 1
    }));

    await setupE2EAuthAndMocks(page, {
      userId,
      profile: {
        tenant_id: tenantId,
        league: 'bronze',
        xp: 1,
        pontos: 1,
        is_pro: false,
        display_name: 'Eu',
        onboarding_completed_at: new Date().toISOString()
      },
      rankingHandlers: {
        [challengesRpcPattern('get_challenges_with_counts')]: async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([challenge]) });
        },
        [challengesRpcPattern('get_my_desafio_ranking_window')]: async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(windowRows) });
        },
        [challengesRpcPattern('get_desafio_ranking_full_active')]: async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fullRows) });
        }
      }
    });

    await goToChallenges(page);
    await page.getByRole('button', { name: /Ver ranking/i }).click();

    await expect(page.getByRole('button', { name: /Ver ranking completo/i })).toBeVisible();
    await page.getByRole('button', { name: /Ver ranking completo/i }).click();

    await expect(page.getByText('Full 1')).toBeVisible();
    await expect(page.getByText('Full 6')).toBeVisible();
  });
});

