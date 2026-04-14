import { useCallback, useEffect, useState } from 'react';
import { Sparkles, ChevronRight, Dumbbell } from 'lucide-react';
import { Card } from './Card.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';

export function WorkoutPlanWidget({ userId, onOpenPlan, onGenerateNew }) {
  const { supabase } = useAuth();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_active_workout_plan', { p_user_id: userId });
      if (error) throw error;
      setPlan(data);
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="h-16 bg-zinc-900 rounded-2xl animate-pulse" />;
  }

  if (!plan) {
    return (
      <button type="button" onClick={onGenerateNew} className="w-full text-left">
        <Card className="flex items-center justify-between hover:border-green-500/30 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Sparkles size={20} className="text-green-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-300">Plano de Treino IA</p>
              <p className="text-[10px] text-zinc-500">Gere seu plano personalizado</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-zinc-600 group-hover:text-green-500 transition-colors" />
        </Card>
      </button>
    );
  }

  const weeksSince = Math.floor((Date.now() - new Date(plan.created_at).getTime()) / (7 * 86400000)) + 1;
  const weekNum = Math.min(weeksSince, plan.duration_weeks);

  const days = Array.isArray(plan.days) ? plan.days : [];
  const progressKey = `plan_progress_${plan.id}`;
  let nextDay = null;
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey) || '{}');
    for (const d of days) {
      const exercises = Array.isArray(d.exercises) ? d.exercises : [];
      const done = saved[d.id] || {};
      const allDone = exercises.length > 0 && exercises.every((_, i) => done[i]);
      if (!allDone) { nextDay = d; break; }
    }
  } catch { /* ignore */ }

  return (
    <button type="button" onClick={onOpenPlan} className="w-full text-left">
      <Card className="flex items-center justify-between hover:border-green-500/30 transition-colors group">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Dumbbell size={20} className="text-green-500" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-zinc-300">{plan.title}</p>
              {plan.ai_generated && <Sparkles size={10} className="text-green-500" />}
            </div>
            <p className="text-[10px] text-zinc-500">
              Semana {weekNum}/{plan.duration_weeks} · {plan.frequency_per_week}x/sem
              {nextDay && <span className="text-green-500"> · Próximo: {nextDay.title}</span>}
            </p>
          </div>
        </div>
        <ChevronRight size={18} className="text-zinc-600 group-hover:text-green-500 transition-colors" />
      </Card>
    </button>
  );
}
