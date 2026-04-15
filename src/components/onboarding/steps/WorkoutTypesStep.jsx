import { useEffect, useState } from 'react';
import { Button } from '../../ui/Button.jsx';

export function WorkoutTypesStep({ supabase, value, onChange, onNext, onSkip }) {
  const [catalog, setCatalog] = useState([]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.rpc('tipo_treino_catalog').then(({ data }) => {
      if (!cancelled && Array.isArray(data)) setCatalog(data);
    });
    return () => { cancelled = true; };
  }, [supabase]);

  function toggle(type) {
    if (value.includes(type)) {
      onChange(value.filter((t) => t !== type));
    } else {
      onChange([...value, type]);
    }
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="text-center space-y-1">
        <p className="text-lg font-bold text-white">Que tipo de treino você pratica?</p>
        <p className="text-sm text-zinc-400">Selecione quantos quiser.</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {catalog.map((type) => {
          const selected = value.includes(type);
          return (
            <button
              key={type}
              type="button"
              role="checkbox"
              aria-checked={selected}
              onClick={() => toggle(type)}
              className={`
                px-4 py-2.5 rounded-full text-sm font-semibold border transition-all
                ${selected
                  ? 'border-green-500 bg-green-500/15 text-green-400 ring-1 ring-green-500/30'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
                }
              `}
            >
              {type}
            </button>
          );
        })}
      </div>

      {catalog.length === 0 && (
        <p className="text-xs text-zinc-500 text-center">Carregando tipos de treino...</p>
      )}

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
