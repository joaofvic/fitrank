import { useState } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell, Flame, Heart, Zap, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { invokeEdge } from '../../lib/supabase/invoke-edge.js';
import { haptic } from '../../lib/haptics.js';

const GOALS = [
  { id: 'hypertrophy', label: 'Hipertrofia', desc: 'Ganho de massa muscular', icon: Dumbbell, color: 'text-blue-500' },
  { id: 'fat_loss', label: 'Emagrecimento', desc: 'Perda de gordura', icon: Flame, color: 'text-orange-500' },
  { id: 'endurance', label: 'Resistência', desc: 'Condicionamento cardio', icon: Heart, color: 'text-red-500' },
  { id: 'general', label: 'Geral', desc: 'Saúde e manutenção', icon: Zap, color: 'text-green-500' },
];

const FREQUENCIES = [2, 3, 4, 5, 6];
const DURATIONS = [
  { weeks: 4, label: '4 sem' },
  { weeks: 8, label: '8 sem' },
  { weeks: 12, label: '12 sem' },
];

const EQUIPMENT = [
  { id: 'full_gym', label: 'Academia completa', desc: 'Todos os equipamentos' },
  { id: 'home_gym', label: 'Home Gym', desc: 'Halteres, barra, banco' },
  { id: 'bodyweight', label: 'Peso corporal', desc: 'Sem equipamento' },
];

export function WorkoutPlanGeneratorView({ onBack, onPlanGenerated }) {
  const { supabase } = useAuth();
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState(null);
  const [frequency, setFrequency] = useState(4);
  const [duration, setDuration] = useState(4);
  const [equipment, setEquipment] = useState('full_gym');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  const handleGenerate = async () => {
    if (!goal || !supabase) return;
    setGenerating(true);
    setError(null);
    haptic('medium');
    try {
      const { data, error: err } = await invokeEdge('generate-workout-plan', supabase, {
        method: 'POST',
        body: { goal, frequency_per_week: frequency, duration_weeks: duration, equipment },
      });
      if (err) throw err;
      setPreview(data);
      setStep(4);
      haptic('success');
    } catch (e) {
      setError(e.message || 'Erro ao gerar plano');
      haptic('error');
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = () => {
    onPlanGenerated?.(preview);
  };

  const handleRegenerate = () => {
    setPreview(null);
    setStep(3);
  };

  if (generating) {
    return (
      <div className="space-y-6 animate-in-fade">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors">
            <ChevronLeft size={20} />
            <span className="text-sm font-semibold">Voltar</span>
          </button>
          <h2 className="text-lg font-black uppercase tracking-tight">Gerando Plano</h2>
          <div className="w-16" />
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <Sparkles size={48} className="text-green-500 animate-pulse" />
            <div className="absolute inset-0 blur-xl bg-green-500/20 rounded-full" />
          </div>
          <Loader2 size={24} className="animate-spin text-green-500" />
          <p className="text-sm text-zinc-400 text-center">
            A IA está criando seu plano personalizado...
          </p>
          <p className="text-xs text-zinc-600">Isso pode levar alguns segundos</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in-fade">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (step > 1 && step < 4) setStep((s) => s - 1);
            else onBack();
          }}
          className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="text-sm font-semibold">{step > 1 && step < 4 ? 'Anterior' : 'Voltar'}</span>
        </button>
        <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
          <Sparkles size={18} className="text-green-500" />
          Plano IA
        </h2>
        <div className="w-16" />
      </div>

      {step < 4 && (
        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${s <= step ? 'bg-green-500' : 'bg-zinc-800'}`} />
          ))}
        </div>
      )}

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">Qual é seu objetivo principal?</p>
          <div className="grid grid-cols-2 gap-2">
            {GOALS.map((g) => {
              const Icon = g.icon;
              const selected = goal === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { setGoal(g.id); setStep(2); }}
                  className={`p-4 rounded-2xl border text-left transition-all active:scale-95 ${
                    selected
                      ? 'bg-green-500/10 border-green-500/40'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <Icon size={24} className={g.color} />
                  <p className="text-sm font-bold text-white mt-2">{g.label}</p>
                  <p className="text-[10px] text-zinc-500">{g.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Quantas vezes por semana?</p>
            <div className="flex gap-2">
              {FREQUENCIES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
                    frequency === f
                      ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                  }`}
                >
                  {f}x
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Duração do plano</p>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.weeks}
                  type="button"
                  onClick={() => setDuration(d.weeks)}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
                    duration === d.weeks
                      ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={() => setStep(3)} className="w-full">
            Próximo <ChevronRight size={16} />
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">Equipamento disponível</p>
          <div className="space-y-2">
            {EQUIPMENT.map((eq) => (
              <button
                key={eq.id}
                type="button"
                onClick={() => setEquipment(eq.id)}
                className={`w-full p-4 rounded-2xl border text-left transition-all ${
                  equipment === eq.id
                    ? 'bg-green-500/10 border-green-500/40'
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'
                }`}
              >
                <p className="text-sm font-bold text-white">{eq.label}</p>
                <p className="text-[10px] text-zinc-500">{eq.desc}</p>
              </button>
            ))}
          </div>
          <Button onClick={handleGenerate} disabled={!goal} className="w-full">
            <Sparkles size={16} />
            Gerar Plano com IA
          </Button>
        </div>
      )}

      {step === 4 && preview && (
        <div className="space-y-4">
          <Card className="border-green-500/20 bg-green-500/5">
            <h3 className="text-base font-black text-white">{preview.title}</h3>
            {preview.description && (
              <p className="text-xs text-zinc-400 mt-1">{preview.description}</p>
            )}
            <div className="flex gap-3 mt-2 text-[10px] text-zinc-500">
              <span>{preview.frequency_per_week}x/sem</span>
              <span>{preview.duration_weeks} semanas</span>
              <span className="capitalize">{preview.difficulty}</span>
            </div>
          </Card>

          {preview.days?.map((day) => (
            <Card key={day.day_number} className="space-y-2">
              <h4 className="text-sm font-bold text-white">{day.title}</h4>
              <div className="flex flex-wrap gap-1">
                {day.muscle_groups?.map((mg) => (
                  <span key={mg} className="px-2 py-0.5 bg-zinc-800 rounded-full text-[10px] text-zinc-400 capitalize">
                    {mg}
                  </span>
                ))}
              </div>
              <div className="space-y-1">
                {day.exercises?.map((ex, i) => (
                  <div key={i} className="flex items-baseline justify-between py-1 border-b border-zinc-800/50 last:border-0">
                    <span className="text-xs text-zinc-300">{ex.name}</span>
                    <span className="text-[10px] text-zinc-500 tabular-nums whitespace-nowrap ml-2">
                      {ex.sets}x{ex.reps} · {ex.rest_seconds}s
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          <div className="flex gap-2">
            <Button onClick={handleRegenerate} variant="outline" className="flex-1">
              <RefreshCw size={14} />
              Refazer
            </Button>
            <Button onClick={handleAccept} className="flex-1">
              Aceitar Plano
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
