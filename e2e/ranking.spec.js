import { test, expect } from '@playwright/test';
import { setupE2EAuthAndMocks, E2E_BASE_URL } from './helpers/supabase-e2e-setup.js';

const BASE_URL = E2E_BASE_URL;

test.describe('Ranking (Top 10 + Sua posição)', () => {
  test('usuário fora do Top 10 vê Top 10 + “Sua posição” (Geral)', async ({ page }) => {
    const userId = '00000000-0000-0000-0000-000000000000';
    const top = Array.from({ length: 10 }).map((_, i) => ({
      // IDs únicos; nomes com padding para evitar colisão de match (ex: "1" em "10")
      id: `11111111-1111-1111-1111-1111111111${(10 + i).toString().padStart(2, '0')}`,
      nome_exibicao: `Geral ${String(i + 1).padStart(2, '0')}`,
      pontos: 1000 - i,
      is_pro: false,
      academia: '',
      avatar_url: null,
      xp: 900,
      league: 'bronze',
      rank: i + 1
    }));

    const me = {
      id: userId,
      nome_exibicao: 'Eu Fora',
      pontos: 1,
      is_pro: false,
      academia: '',
      avatar_url: null,
      xp: 900,
      league: 'bronze',
      rank: 99
    };

    await setupE2EAuthAndMocks(page, {
      userId,
      profile: {
        tenant_id: '00000000-0000-0000-0000-0000000000ab',
        league: 'bronze',
        xp: 900,
        pontos: 1,
        is_pro: false,
        display_name: 'Eu Fora',
        onboarding_completed_at: new Date().toISOString()
      },
      rankingHandlers: {
        '**/rest/v1/rpc/get_tenant_leaderboard_top_period*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(top) });
        },
        '**/rest/v1/rpc/get_my_tenant_rank_period*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([me]) });
        },
        '**/rest/v1/rpc/get_league_leaderboard_top*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(top) });
        },
        '**/rest/v1/rpc/get_my_league_rank_period*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([me]) });
        }
      }
    });

    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: /Ranking de usuários/i })).toBeVisible();
    await expect(page.getByText('Top 10')).toBeVisible();

    // 10 cards do Top 10
    for (let i = 1; i <= 10; i += 1) {
      const label = String(i).padStart(2, '0');
      await expect(page.getByRole('button', { name: new RegExp(`Geral ${label}`) })).toBeVisible();
    }

    // Card "Sua posição" (fora do Top 10)
    await expect(page.getByText('Sua posição')).toBeVisible();
    await expect(page.getByRole('button', { name: /#99.*Eu Fora/i })).toBeVisible();
  });

  test('usuário dentro do Top 10 não vê card duplicado', async ({ page }) => {
    const userId = '00000000-0000-0000-0000-000000000001';
    const top = Array.from({ length: 10 }).map((_, i) => ({
      id: i === 2 ? userId : `00000000-0000-0000-0000-00000000000${i + 2}`,
      nome_exibicao: i === 2 ? 'Eu' : `Atleta ${i + 1}`,
      pontos: 1000 - i * 10,
      is_pro: false,
      academia: '',
      avatar_url: null,
      xp: 1000,
      league: 'bronze',
      rank: i + 1
    }));

    const me = { ...top[2] };

    await setupE2EAuthAndMocks(page, {
      userId,
      profile: {
        tenant_id: '00000000-0000-0000-0000-0000000000aa',
        league: 'bronze',
        xp: 1000,
        pontos: 999,
        is_pro: false,
        display_name: 'Eu',
        onboarding_completed_at: new Date().toISOString()
      },
      rankingHandlers: {
        '**/rest/v1/rpc/get_tenant_leaderboard_top_period*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(top) });
        },
        '**/rest/v1/rpc/get_my_tenant_rank_period*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([me]) });
        },
        '**/rest/v1/rpc/get_league_leaderboard_top*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(top) });
        },
        '**/rest/v1/rpc/get_my_league_rank_period*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([me]) });
        }
      }
    });

    await page.goto(BASE_URL);

    // A lista do ranking carrega e existe “Ranking de usuários”
    await expect(page.getByRole('heading', { name: /Ranking de usuários/i })).toBeVisible();

    // Como o usuário está no Top 10, NÃO deve existir a seção “Sua posição”
    await expect(page.getByText('Sua posição')).toHaveCount(0);
  });

  test('aba “Liga” aplica a mesma regra (mostra “Sua posição” só quando fora do Top 10)', async ({ page }) => {
    const userId = '00000000-0000-0000-0000-000000000002';
    const leagueTop = Array.from({ length: 10 }).map((_, i) => ({
      id: `00000000-0000-0000-0000-00000000001${i}`,
      nome_exibicao: `Liga ${i + 1}`,
      pontos: 500 - i,
      is_pro: false,
      academia: '',
      avatar_url: null,
      xp: 600,
      league: 'silver',
      rank: i + 1
    }));
    const meLeague = {
      id: userId,
      nome_exibicao: 'Eu (Liga)',
      pontos: 123,
      is_pro: false,
      academia: '',
      avatar_url: null,
      xp: 600,
      league: 'silver',
      rank: 42
    };

    await setupE2EAuthAndMocks(page, {
      userId,
      profile: {
        tenant_id: '00000000-0000-0000-0000-0000000000bb',
        league: 'silver',
        xp: 600,
        pontos: 10,
        is_pro: false,
        display_name: 'Eu',
        onboarding_completed_at: new Date().toISOString()
      },
      rankingHandlers: {
        '**/rest/v1/rpc/get_tenant_leaderboard_top_period*': async (route) => {
          // geral: não importa aqui
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(leagueTop) });
        },
        '**/rest/v1/rpc/get_my_tenant_rank_period*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...meLeague, league: 'silver' }]) });
        },
        '**/rest/v1/rpc/get_league_leaderboard_top*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(leagueTop) });
        },
        '**/rest/v1/rpc/get_my_league_rank_period*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([meLeague]) });
        }
      }
    });

    await page.goto(BASE_URL);
    await expect(page.getByRole('heading', { name: /Ranking de usuários/i })).toBeVisible();

    // Troca para aba Liga
    await page.getByRole('tab', { name: /Liga/i }).click();

    // Deve exibir “Sua posição” porque eu estou fora do Top 10 na liga
    await expect(page.getByText('Sua posição')).toBeVisible();
    await expect(page.getByRole('button', { name: /#42.*Eu \(Liga\)/i })).toBeVisible();
  });

  test('troca de período (dia/semana/mês) mantém coerência da posição', async ({ page }) => {
    const userId = '00000000-0000-0000-0000-000000000003';

    const meByPeriod = {
      day: 5,
      week: 12,
      month: 30
    };

    const topByPeriod = (period) =>
      Array.from({ length: 10 }).map((_, i) => ({
        id: `00000000-0000-0000-0000-00000000002${i}`,
        nome_exibicao: `${period} ${i + 1}`,
        pontos: 100 - i,
        is_pro: false,
        academia: '',
        avatar_url: null,
        xp: 800,
        league: 'bronze',
        rank: i + 1
      }));

    await setupE2EAuthAndMocks(page, {
      userId,
      profile: {
        tenant_id: '00000000-0000-0000-0000-0000000000cc',
        league: 'bronze',
        xp: 800,
        pontos: 10,
        is_pro: false,
        display_name: 'Eu',
        onboarding_completed_at: new Date().toISOString()
      },
      rankingHandlers: {
        '**/rest/v1/rpc/get_tenant_leaderboard_top_period*': async (route) => {
          const body = route.request().postDataJSON?.() || {};
          const p = body?.p_period || 'month';
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(topByPeriod(p)) });
        },
        '**/rest/v1/rpc/get_my_tenant_rank_period*': async (route) => {
          const body = route.request().postDataJSON?.() || {};
          const p = body?.p_period || 'month';
          const rank = meByPeriod[p] ?? 30;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{
              id: userId,
              nome_exibicao: 'Eu',
              pontos: 10,
              is_pro: false,
              academia: '',
              avatar_url: null,
              xp: 800,
              league: 'bronze',
              rank
            }])
          });
        },
        '**/rest/v1/rpc/get_league_leaderboard_top*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(topByPeriod('month')) });
        },
        '**/rest/v1/rpc/get_my_league_rank_period*': async (route) => {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        }
      }
    });

    await page.goto(BASE_URL);
    await expect(page.getByRole('heading', { name: /Ranking de usuários/i })).toBeVisible();

    // Mês (default) -> #30
    await expect(page.getByText('Sua posição')).toBeVisible();
    await expect(page.getByRole('button', { name: /#30.*Eu/i })).toBeVisible();

    // Dia -> #5
    await page.getByRole('tab', { name: /^Dia$/i }).click();
    await expect(page.getByRole('button', { name: /#5.*Eu/i })).toBeVisible();

    // Semana -> #12
    await page.getByRole('tab', { name: /^Semana$/i }).click();
    await expect(page.getByRole('button', { name: /#12.*Eu/i })).toBeVisible();

    // Mês -> #30
    await page.getByRole('tab', { name: /^Mês$/i }).click();
    await expect(page.getByRole('button', { name: /#30.*Eu/i })).toBeVisible();
  });
});

