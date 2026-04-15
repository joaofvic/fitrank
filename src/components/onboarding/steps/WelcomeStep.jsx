import { Trophy, Swords, Users } from 'lucide-react';
import { Button } from '../../ui/Button.jsx';

const HIGHLIGHTS = [
  { icon: Trophy, label: 'Ranking', desc: 'Suba no ranking treinando todos os dias' },
  { icon: Swords, label: 'Desafios', desc: 'Participe de desafios e ganhe prêmios' },
  { icon: Users, label: 'Comunidade', desc: 'Treine com amigos e compartilhe resultados' },
];

export function WelcomeStep({ displayName, onNext }) {
  return (
    <div className="flex flex-col items-center text-center gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="space-y-2">
        <h1 className="text-4xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600 uppercase">
          FitRank
        </h1>
        <p className="text-xl font-bold text-white">
          Olá, {displayName || 'atleta'}!
        </p>
        <p className="text-sm text-zinc-400">
          Bem-vindo ao FitRank — sua plataforma de ranking fitness.
        </p>
      </div>

      <div className="w-full space-y-3">
        {HIGHLIGHTS.map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            className="flex items-center gap-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4 text-left"
          >
            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <Icon size={22} className="text-green-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">{label}</p>
              <p className="text-xs text-zinc-400">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        onClick={onNext}
        className="w-full py-3.5 rounded-xl font-bold text-base"
      >
        Começar
      </Button>
    </div>
  );
}
