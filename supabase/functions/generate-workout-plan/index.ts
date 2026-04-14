import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'npm:zod@3.24.2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const requestSchema = z.object({
  goal: z.enum(['hypertrophy', 'fat_loss', 'endurance', 'general']),
  frequency_per_week: z.number().int().min(2).max(6),
  duration_weeks: z.number().int().min(4).max(12).default(4),
  equipment: z.enum(['full_gym', 'home_gym', 'bodyweight']).default('full_gym'),
});

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: 'Hipertrofia (ganho de massa muscular)',
  fat_loss: 'Emagrecimento (perda de gordura)',
  endurance: 'Resistência e condicionamento',
  general: 'Saúde geral e manutenção',
};

const EQUIPMENT_LABELS: Record<string, string> = {
  full_gym: 'Academia completa com todos os equipamentos',
  home_gym: 'Home gym (halteres, barra, banco)',
  bodyweight: 'Sem equipamento (peso corporal)',
};

interface Exercise {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  notes?: string;
}

interface PlanDay {
  day_number: number;
  title: string;
  muscle_groups: string[];
  exercises: Exercise[];
}

interface GeneratedPlan {
  title: string;
  description: string;
  difficulty: string;
  days: PlanDay[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: 'Configuração do servidor incompleta' }, 500);
  }
  if (!openaiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY não configurada' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Não autorizado' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'Sessão inválida' }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Payload inválido', details: parsed.error.flatten() }, 400);
  }

  const { goal, frequency_per_week, duration_weeks, equipment } = parsed.data;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Fetch user context
  const [checkinsRes, measurementsRes] = await Promise.all([
    admin
      .from('checkins')
      .select('tipo_treino, checkin_local_date')
      .eq('user_id', user.id)
      .neq('photo_review_status', 'rejected')
      .order('checkin_local_date', { ascending: false })
      .limit(30),
    admin
      .from('body_measurements')
      .select('weight_kg, body_fat_pct')
      .eq('user_id', user.id)
      .order('measured_at', { ascending: false })
      .limit(1),
  ]);

  const recentCheckins = checkinsRes.data || [];
  const latestMeasurement = measurementsRes.data?.[0];

  const typeCounts: Record<string, number> = {};
  for (const c of recentCheckins) {
    typeCounts[c.tipo_treino] = (typeCounts[c.tipo_treino] || 0) + 1;
  }
  const frequentTypes = Object.entries(typeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([t, c]) => `${t} (${c}x)`);

  const contextLines: string[] = [];
  if (recentCheckins.length > 0) {
    contextLines.push(`Últimos 30 check-ins: ${recentCheckins.length} treinos.`);
    contextLines.push(`Tipos mais frequentes: ${frequentTypes.join(', ')}.`);
  }
  if (latestMeasurement?.weight_kg) {
    contextLines.push(`Peso atual: ${latestMeasurement.weight_kg} kg.`);
  }
  if (latestMeasurement?.body_fat_pct) {
    contextLines.push(`Gordura corporal: ${latestMeasurement.body_fat_pct}%.`);
  }

  const systemPrompt = `Você é um personal trainer experiente. Gere um plano de treino em JSON.
Responda APENAS com JSON válido, sem markdown nem texto extra.

O JSON deve seguir exatamente este schema:
{
  "title": "string (nome curto do plano)",
  "description": "string (descrição breve do objetivo)",
  "difficulty": "beginner" | "intermediate" | "advanced",
  "days": [
    {
      "day_number": number (1-based),
      "title": "string (ex: Dia 1 - Peito e Tríceps)",
      "muscle_groups": ["string"],
      "exercises": [
        {
          "name": "string (nome do exercício em português)",
          "sets": number,
          "reps": "string (ex: '12', '8-12', '30s')",
          "rest_seconds": number,
          "notes": "string (dica opcional)"
        }
      ]
    }
  ]
}

Regras:
- Gere exatamente ${frequency_per_week} dias de treino
- Cada dia deve ter 5-8 exercícios
- Distribua grupos musculares de forma equilibrada
- Adapte ao equipamento disponível
- Varie exercícios compostos e isolados
- Inclua aquecimento no primeiro exercício de cada dia`;

  const userPrompt = `Gere um plano de treino com:
- Objetivo: ${GOAL_LABELS[goal]}
- Frequência: ${frequency_per_week}x por semana
- Duração: ${duration_weeks} semanas
- Equipamento: ${EQUIPMENT_LABELS[equipment]}
${contextLines.length > 0 ? '\nContexto do usuário:\n' + contextLines.join('\n') : ''}`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI error:', openaiRes.status, errText);
      let detail = `OpenAI ${openaiRes.status}`;
      try {
        const parsed = JSON.parse(errText);
        detail = parsed?.error?.message || detail;
      } catch { /* ignore */ }
      return jsonResponse({ error: `Erro ao gerar plano: ${detail}` }, 502);
    }

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content;
    if (!content) {
      return jsonResponse({ error: 'Resposta vazia da IA' }, 502);
    }

    let plan: GeneratedPlan;
    try {
      plan = JSON.parse(content);
    } catch {
      console.error('Failed to parse AI response:', content);
      return jsonResponse({ error: 'Resposta inválida da IA' }, 502);
    }

    if (!plan.title || !plan.days || !Array.isArray(plan.days)) {
      return jsonResponse({ error: 'Plano gerado com formato inválido' }, 502);
    }

    // Archive existing active plans
    await admin
      .from('workout_plans')
      .update({ status: 'archived' })
      .eq('user_id', user.id)
      .eq('status', 'active');

    // Save plan
    const { data: planRow, error: planErr } = await admin
      .from('workout_plans')
      .insert({
        user_id: user.id,
        title: plan.title,
        description: plan.description || '',
        goal,
        frequency_per_week,
        duration_weeks,
        difficulty: plan.difficulty || 'intermediate',
        ai_generated: true,
        status: 'active',
      })
      .select('id')
      .single();

    if (planErr || !planRow) {
      console.error('Error saving plan:', planErr?.message);
      return jsonResponse({ error: 'Erro ao salvar plano' }, 500);
    }

    const dayRows = plan.days.map((d: PlanDay) => ({
      plan_id: planRow.id,
      day_number: d.day_number,
      title: d.title,
      muscle_groups: d.muscle_groups,
      exercises: d.exercises,
    }));

    const { error: daysErr } = await admin.from('workout_plan_days').insert(dayRows);
    if (daysErr) {
      console.error('Error saving plan days:', daysErr.message);
    }

    return jsonResponse({
      id: planRow.id,
      title: plan.title,
      description: plan.description,
      goal,
      frequency_per_week,
      duration_weeks,
      difficulty: plan.difficulty,
      days: plan.days,
    }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error('generate-workout-plan:', message);
    return jsonResponse({ error: message }, 500);
  }
});
