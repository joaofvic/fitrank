import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ── PostHog helpers ──────────────────────────────────────────

async function posthogQuery(kind: string, query: Record<string, unknown>) {
  const apiKey = Deno.env.get('POSTHOG_PERSONAL_API_KEY');
  const projectId = Deno.env.get('POSTHOG_PROJECT_ID');
  const host = Deno.env.get('POSTHOG_HOST') || 'https://us.i.posthog.com';

  if (!apiKey || !projectId) return { error: 'PostHog não configurado' };

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query: { kind, ...query } })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`admin-observability: PostHog ${kind} failed`, res.status, text);
    return { error: `PostHog ${res.status}` };
  }

  return await res.json();
}

async function fetchMetrics() {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const [dau, wau, mau] = await Promise.all([
    posthogQuery('TrendsQuery', {
      series: [{ event: '$pageview', kind: 'EventsNode', math: 'dau' }],
      dateRange: { date_from: '-7d' },
      interval: 'day'
    }),
    posthogQuery('TrendsQuery', {
      series: [{ event: '$pageview', kind: 'EventsNode', math: 'weekly_active' }],
      dateRange: { date_from: '-14d' },
      interval: 'week'
    }),
    posthogQuery('TrendsQuery', {
      series: [{ event: '$pageview', kind: 'EventsNode', math: 'monthly_active' }],
      dateRange: { date_from: '-60d' },
      interval: 'month'
    })
  ]);

  const extractLast = (result: any) => {
    if (result?.error) return null;
    const data = result?.results?.[0]?.data;
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[data.length - 1];
  };

  const extractPrev = (result: any) => {
    if (result?.error) return null;
    const data = result?.results?.[0]?.data;
    if (!Array.isArray(data) || data.length < 2) return null;
    return data[data.length - 2];
  };

  return {
    dau: { current: extractLast(dau), previous: extractPrev(dau), date: todayStr },
    wau: { current: extractLast(wau), previous: extractPrev(wau) },
    mau: { current: extractLast(mau), previous: extractPrev(mau) }
  };
}

async function fetchFunnel() {
  const result = await posthogQuery('FunnelsQuery', {
    series: [
      { event: 'checkin_started', kind: 'EventsNode' },
      { event: 'checkin_submitted', kind: 'EventsNode' },
      { event: 'checkin_success', kind: 'EventsNode' }
    ],
    dateRange: { date_from: '-7d' },
    funnelsFilter: { funnelWindowInterval: 1, funnelWindowIntervalUnit: 'day' }
  });

  if (result?.error) return { error: result.error };

  const steps = result?.results;
  if (!Array.isArray(steps)) return { steps: [] };

  return {
    steps: steps.map((s: any) => ({
      name: s.name ?? s.custom_name ?? 'Step',
      count: s.count ?? 0,
      conversionRate: s.conversion_rate != null ? Math.round(s.conversion_rate * 100) : null
    }))
  };
}

// ── Sentry helper ────────────────────────────────────────────

async function fetchErrors() {
  const token = Deno.env.get('SENTRY_AUTH_TOKEN');
  const org = Deno.env.get('SENTRY_ORG_SLUG');
  const project = Deno.env.get('SENTRY_PROJECT_SLUG');

  if (!token || !org || !project) return { error: 'Sentry não configurado' };

  const url = `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved&statsPeriod=24h&limit=5&sort=freq`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('admin-observability: Sentry failed', res.status, text);
    return { error: `Sentry ${res.status}` };
  }

  const issues: any[] = await res.json();

  return {
    issues: issues.map((i: any) => ({
      id: i.id,
      title: i.title,
      culprit: i.culprit,
      count: Number(i.count ?? 0),
      firstSeen: i.firstSeen,
      lastSeen: i.lastSeen,
      level: i.level,
      permalink: i.permalink
    }))
  };
}

// ── Web Vitals via PostHog ───────────────────────────────────

async function fetchVitals() {
  const result = await posthogQuery('HogQLQuery', {
    query: `
      SELECT
        properties.metric AS metric,
        avg(toFloat64OrNull(properties.value)) AS avg_value,
        count() AS sample_count
      FROM events
      WHERE event = 'web_vitals'
        AND timestamp >= now() - INTERVAL 7 DAY
        AND properties.metric IN ('LCP', 'INP', 'CLS')
      GROUP BY properties.metric
      ORDER BY properties.metric
    `
  });

  if (result?.error) return { error: result.error };

  const rows = result?.results ?? [];
  const columns = result?.columns ?? ['metric', 'avg_value', 'sample_count'];

  const vitals: Record<string, { value: number; samples: number; rating: string }> = {};

  const thresholds: Record<string, [number, number]> = {
    LCP: [2500, 4000],
    INP: [200, 500],
    CLS: [100, 250]
  };

  for (const row of rows) {
    const metric = row[0] as string;
    const avg = Math.round(Number(row[1]) || 0);
    const samples = Number(row[2]) || 0;
    const [good, poor] = thresholds[metric] ?? [0, 0];
    const rating = avg <= good ? 'good' : avg <= poor ? 'needs-improvement' : 'poor';
    vitals[metric] = { value: avg, samples, rating };
  }

  return { vitals, columns };
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    return json({ error: 'Configuração do servidor incompleta' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Não autorizado' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json({ error: 'Sessão inválida' }, 401);
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('is_platform_master')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile?.is_platform_master) {
    return json({ error: 'Acesso negado' }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body inválido' }, 400);
  }

  const action = body?.action;

  try {
    switch (action) {
      case 'metrics':
        return json(await fetchMetrics());
      case 'funnel':
        return json(await fetchFunnel());
      case 'errors':
        return json(await fetchErrors());
      case 'vitals':
        return json(await fetchVitals());
      case 'all': {
        const [metrics, funnel, errors, vitals] = await Promise.all([
          fetchMetrics(),
          fetchFunnel(),
          fetchErrors(),
          fetchVitals()
        ]);
        return json({ metrics, funnel, errors, vitals });
      }
      default:
        return json({ error: 'action inválida (metrics | funnel | errors | vitals | all)' }, 400);
    }
  } catch (err) {
    console.error('admin-observability:', (err as Error).message);
    return json({ error: 'Erro interno' }, 500);
  }
});
