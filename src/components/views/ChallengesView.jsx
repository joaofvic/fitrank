import { Trophy, User, Info } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';

function formatRange(startsOn, endsOn) {
  if (!startsOn || !endsOn) return '';
  const a = new Date(startsOn + 'T12:00:00').toLocaleDateString('pt-BR');
  const b = new Date(endsOn + 'T12:00:00').toLocaleDateString('pt-BR');
  return `${a} — ${b}`;
}

export function ChallengesView({ challenges, ranking, onJoin }) {
  const first = challenges[0];

  return (
    <div className="space-y-6 animate-in-fade">
      <div className="space-y-1">
        <h2 className="text-2xl font-black">Desafios Ativos</h2>
        <p className="text-zinc-500">Supere limites e ganhe prêmios exclusivos.</p>
      </div>

      <div className="space-y-4">
        {challenges.length === 0 ? (
          <Card className="border-zinc-800 text-zinc-500 text-center py-10">Nenhum desafio ativo no momento.</Card>
        ) : (
          challenges.map((challenge) => (
            <Card key={challenge.id} className="group relative overflow-hidden">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="bg-zinc-800 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase mb-2 inline-block">
                      Mensal
                    </div>
                    <h3 className="text-xl font-bold">{challenge.nome}</h3>
                    <p className="text-zinc-500 text-sm mt-1">{formatRange(challenge.starts_on, challenge.ends_on)}</p>
                    {challenge.reward_label && (
                      <p className="text-zinc-400 text-sm mt-1">Prêmio: {challenge.reward_label}</p>
                    )}
                  </div>
                  <div className="bg-yellow-500/10 p-2 rounded-xl border border-yellow-500/20">
                    <Trophy size={24} className="text-yellow-500" />
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <Button variant="outline" className="py-1 px-4 text-xs h-8" onClick={() => onJoin?.(challenge.id)}>
                    Participar
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}

        {first && ranking.length > 0 && (
          <Card className="border-green-500/20">
            <h4 className="font-bold mb-3 flex items-center gap-2 text-green-400">
              <Trophy className="w-4 h-4" />
              Ranking — {first.nome}
            </h4>
            <div className="space-y-2">
              {ranking.map((row) => (
                <div
                  key={row.userId ?? `${row.rank}-${row.nome}`}
                  className={`flex justify-between items-center p-3 rounded-xl border ${
                    row.isSelf ? 'border-green-500/40 bg-green-500/5' : 'border-zinc-800 bg-zinc-900/50'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500 w-6">#{row.rank}</span>
                    <User size={14} className="text-zinc-500" />
                    <span className={row.isSelf ? 'text-green-400 font-bold' : ''}>{row.nome}</span>
                  </span>
                  <span className="font-black text-white">{row.pontos} pts</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6 text-center space-y-3">
          <Info className="w-8 h-8 text-orange-500 mx-auto" />
          <h4 className="font-bold text-orange-500">Desafios Pagos</h4>
          <p className="text-sm text-zinc-400">
            Torneios com premiação via PIX integrados ao Stripe em evolução — veja PRD e roadmap.
          </p>
        </div>
      </div>
    </div>
  );
}
