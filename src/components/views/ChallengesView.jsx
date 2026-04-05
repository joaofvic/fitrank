import { Trophy, User, Info } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';

const MOCK_CHALLENGES = [
  { id: 1, title: '30 Dias de Fogo', participants: 154, type: 'Resistência', reward: 'Badge Lendária', progress: 0 },
  { id: 2, title: 'Semana Hardcore', participants: 89, type: 'Intensidade', reward: '500 Pontos', progress: 0 }
];

export function ChallengesView() {
  return (
    <div className="space-y-6 animate-in-fade">
      <div className="space-y-1">
        <h2 className="text-2xl font-black">Desafios Ativos</h2>
        <p className="text-zinc-500">Supere limites e ganhe prêmios exclusivos.</p>
      </div>

      <div className="space-y-4">
        {MOCK_CHALLENGES.map((challenge) => (
          <Card key={challenge.id} className="group relative overflow-hidden">
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="bg-zinc-800 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase mb-2 inline-block">
                    {challenge.type}
                  </div>
                  <h3 className="text-xl font-bold">{challenge.title}</h3>
                  <p className="text-zinc-500 text-sm flex items-center gap-1 mt-1">
                    <User size={14} /> {challenge.participants} atletas inscritos
                  </p>
                </div>
                <div className="bg-yellow-500/10 p-2 rounded-xl border border-yellow-500/20">
                  <Trophy size={24} className="text-yellow-500" />
                </div>
              </div>

              <div className="bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div className="bg-green-500 h-full w-[0%]" />
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">
                  Prêmio: <span className="text-white font-medium">{challenge.reward}</span>
                </span>
                <Button variant="outline" className="py-1 px-4 text-xs h-8">
                  Participar
                </Button>
              </div>
            </div>
          </Card>
        ))}

        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6 text-center space-y-3">
          <Info className="w-8 h-8 text-orange-500 mx-auto" />
          <h4 className="font-bold text-orange-500">Desafios Pagos</h4>
          <p className="text-sm text-zinc-400">
            Entre em torneios com premiação em dinheiro real via PIX! Em breve.
          </p>
        </div>
      </div>
    </div>
  );
}
