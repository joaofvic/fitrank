import {
  Dumbbell, Zap, Activity, HeartPulse, Footprints, Flame, CheckCircle2
} from 'lucide-react';

const WORKOUT_ICON_MAP = {
  musculacao: Dumbbell,
  crossfit: Zap,
  funcional: Activity,
  cardio: HeartPulse,
  corrida: Footprints,
  outro: Flame,
};

export function workoutTypeIcon(type) {
  const key = (type ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return WORKOUT_ICON_MAP[key] ?? CheckCircle2;
}
