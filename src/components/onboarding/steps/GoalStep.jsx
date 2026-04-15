import { Flame, Dumbbell, HeartPulse, Activity } from 'lucide-react';
import { Button } from '../../ui/Button.jsx';

const GOALS = [
  { id: 'emagrecer', icon: Flame, label: 'Emagrecer', desc: 'Perder gordura e definir o corpo' },
  { id: 'ganhar_massa', icon: Dumbbell, label: 'Ganhar Massa', desc: 'Hipertrofia e força muscular' },
  { id: 'resistencia', icon: HeartPulse, label: 'Resistência', desc: 'Melhorar condicionamento físico' },
  { id: 'saude_geral', icon: Activity, label: 'Saúde Geral', desc: 'Manter-se ativo e saudável' },
];

export function GoalStep({ value, onChange, onNext, onSkip }) {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="text-center space-y-1">
        <p className="text-lg font-bold text-white">Qual o seu principal objetivo?</p>
        <p className="text-sm text-zinc-400">Isso nos ajuda a personalizar sua experiência.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {GOALS.map(({ id, icon: Icon, label, desc }) => {
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? null : id)}
              className={`
                flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all
                ${selected
                  ? 'border-green-500 bg-green-500/10 ring-1 ring-green-500/30'
                  : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                }
              `}
            >
              <div className={`
                w-12 h-12 rounded-xl flex items-center justify-center
                ${selected ? 'bg-green-500/20' : 'bg-zinc-800/60'}
              `}>
                <Icon size={24} className={selected ? 'text-green-400' : 'text-zinc-400'} aria-hidden="true" />
              </div>
              <div>
                <p className={`text-sm font-bold ${selected ? 'text-green-400' : 'text-white'}`}>{label}</p>
                <p className="text-[11px] text-zinc-500 leading-tight mt-0.5">{desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          onClick={onNext}
          className="w-full py-3.5 rounded-xl font-bold text-base"
        >
          Continuar
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-center text-sm text-zinc-500 hover:text-green-400 transition-colors py-2"
        >
          Pular
        </button>
      </div>
    </div>
  );
}
