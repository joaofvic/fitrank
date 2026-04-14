import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronDown, ChevronUp, CheckCircle2, Circle,
  Timer, Trash2, Loader2, Sparkles, Archive
} from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { logger } from '../../lib/logger.js';

const GOAL_LABELS = {
  hypertrophy: 'Hipertrofia',
  fat_loss: 'Emagrecimento',
  endurance: 'Resistência',
  general: 'Geral',
};

function getChecked(planId) {
  try {
    return JSON.parse(localStorage.getItem(`plan_progress_${planId}`) || '{}');
  } catch {
    return {};
  }
}

function setChecked(planId, data) {
  try {
    localStorage.setItem(`plan_progress_${planId}`, JSON.stringify(data));
  } catch { /* quota */ }
}

function ExerciseRow({ exercise, idx, dayNum, planId, onOpenTimer }) {
  const key = `${dayNum}-${idx}`;
  const [done, setDone] = useState(() => !!getChecked(planId)[key]);

  const toggle = () => {
    const next = !done;
    setDone(next);
    const all = getChecked(planId);
    if (next) all[key] = true;
    else delete all[key];
    setChecked(planId, all);
  };

  return (
    <div className={`flex items-center gap-3 py-2.5 border-b border-zinc-800/50 last:border-0 transition-opacity ${done ? 'opacity-50' : ''}`}>
      <button type="button" onClick={toggle} className="flex-shrink-0">
        {done
          ? <CheckCircle2 size={20} className="text-green-500" />
          : <Circle size={20} className="text-zinc-700" />
        }
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${done ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
          {exercise.name}
        </p>
        <p className="text-[10px] text-zinc-600 tabular-nums">
          {exercise.sets}x{exercise.reps} · descanso {exercise.rest_seconds}s
        </p>
        {exercise.notes && (
          <p className="text-[10px] text-zinc-700 italic mt-0.5">{exercise.notes}</p>
        )}
      </div>
      {onOpenTimer && (
        <button
          type="button"
          onClick={() => onOpenTimer(exercise.rest_seconds)}
          className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-green-400 hover:border-green-500/40 transition-colors flex-shrink-0"
          aria-label={`Timer ${exercise.rest_seconds}s`}
        >
          <Timer size={14} />
        </button>
      )}
    </div>
  );
}

function DayAccordion({ day, planId, onOpenTimer, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const exercises = day.exercises || [];

  const checkedCount = useMemo(() => {
    const all = getChecked(planId);
    return exercises.filter((_, i) => all[`${day.day_number}-${i}`]).length;
  }, [exercises, day.day_number, planId]);

  const progress = exercises.length > 0 ? Math.round((checkedCount / exercises.length) * 100) : 0;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between py-1"
      >
        <div className="text-left">
          <p className="text-sm font-bold text-white">{day.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex flex-wrap gap-1">
              {day.muscle_groups?.map((mg) => (
                <span key={mg} className="px-1.5 py-0.5 bg-zinc-800 rounded text-[9px] text-zinc-500 capitalize">{mg}</span>
              ))}
            </div>
            <span className="text-[10px] text-zinc-600 tabular-nums">{checkedCount}/{exercises.length}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {progress > 0 && (
            <div className="w-8 h-8 relative">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="rgb(39 39 42)" strokeWidth="3" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="rgb(34 197 94)" strokeWidth="3" strokeDasharray={`${progress * 0.88} 100`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-zinc-400">{progress}%</span>
            </div>
          )}
          {open ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
        </div>
      </button>
      {open && (
        <div className="mt-2 border-t border-zinc-800 pt-2">
          {exercises.map((ex, i) => (
            <ExerciseRow
              key={i}
              exercise={ex}
              idx={i}
              dayNum={day.day_number}
              planId={planId}
              onOpenTimer={onOpenTimer}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

export function WorkoutPlanView({ onBack, onOpenTimer, onGenerateNew }) {
  const { supabase, session } = useAuth();
  const userId = session?.user?.id;
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadPlan = useCallback(async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_active_workout_plan', { p_user_id: userId });
      if (error) throw error;
      setPlan(data);
    } catch (e) {
      logger.error('load workout plan', e);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  const handleArchive = async () => {
    if (!supabase || !plan?.id) return;
    try {
      await supabase.from('workout_plans').update({ status: 'archived' }).eq('id', plan.id);
      setPlan(null);
    } catch (e) {
      logger.error('archive plan', e);
    }
  };

  const weeksSinceCreation = plan?.created_at
    ? Math.floor((Date.now() - new Date(plan.created_at).getTime()) / (7 * 86400000)) + 1
    : 1;

  const overallProgress = useMemo(() => {
    if (!plan?.id || !plan?.days) return 0;
    const checked = getChecked(plan.id);
    let total = 0;
    let done = 0;
    for (const day of plan.days) {
      const exCount = day.exercises?.length || 0;
      total += exCount;
      for (let i = 0; i < exCount; i++) {
        if (checked[`${day.day_number}-${i}`]) done++;
      }
    }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [plan]);

  if (loading) {
    return (
      <div className="space-y-4 animate-in-fade">
        <div className="h-6 bg-zinc-800 rounded w-32 animate-pulse" />
        {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-zinc-900 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-6 animate-in-fade">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors">
            <ChevronLeft size={20} />
            <span className="text-sm font-semibold">Voltar</span>
          </button>
          <h2 className="text-lg font-black uppercase tracking-tight">Meu Plano</h2>
          <div className="w-16" />
        </div>
        <div className="text-center py-16 border-2 border-dashed border-zinc-800 rounded-2xl">
          <Sparkles className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500 mb-1">Nenhum plano ativo</p>
          <p className="text-xs text-zinc-600 mb-4">Gere um plano personalizado com IA</p>
          <Button onClick={onGenerateNew}>
            <Sparkles size={16} />
            Gerar Plano
          </Button>
        </div>
      </div>
    );
  }

  const days = plan.days || [];

  return (
    <div className="space-y-4 animate-in-fade">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors">
          <ChevronLeft size={20} />
          <span className="text-sm font-semibold">Voltar</span>
        </button>
        <h2 className="text-lg font-black uppercase tracking-tight">Meu Plano</h2>
        <div className="w-16" />
      </div>

      <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-black text-white">{plan.title}</h3>
            <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-zinc-500">
              <span>{GOAL_LABELS[plan.goal] || plan.goal}</span>
              <span>{plan.frequency_per_week}x/sem</span>
              <span>{plan.duration_weeks} semanas</span>
            </div>
          </div>
          {plan.ai_generated && <Sparkles size={16} className="text-green-500 flex-shrink-0 mt-1" />}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${overallProgress}%` }} />
          </div>
          <span className="text-xs font-bold text-zinc-400 tabular-nums">{overallProgress}%</span>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">
          Semana {Math.min(weeksSinceCreation, plan.duration_weeks)} de {plan.duration_weeks}
        </p>
      </Card>

      {days.map((day, idx) => (
        <DayAccordion
          key={day.id || day.day_number}
          day={day}
          planId={plan.id}
          onOpenTimer={onOpenTimer}
          defaultOpen={idx === 0}
        />
      ))}

      <div className="flex gap-2 pt-2">
        <Button onClick={handleArchive} variant="outline" className="flex-1 text-xs">
          <Archive size={14} />
          Arquivar
        </Button>
        <Button onClick={onGenerateNew} variant="secondary" className="flex-1 text-xs">
          <Sparkles size={14} />
          Novo Plano
        </Button>
      </div>
    </div>
  );
}
