import { Trophy, Flame, User, Dumbbell, Crown, TrendingUp, Zap } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';

export function HomeView({ user, userData, allUsers, onOpenCheckin }) {
  return (
    <div className="space-y-6 animate-in-fade">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-zinc-400 text-sm font-medium">Bem-vindo de volta,</h2>
          <p className="text-2xl font-bold text-white flex items-center gap-2">
            {userData?.nome || 'Atleta'}
            {userData?.is_pro && <Crown className="w-5 h-5 text-yellow-500 fill-yellow-500" />}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
            <span className="text-orange-500 font-bold">{userData?.streak || 0}</span>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-green-500 fill-green-500" />
            <span className="text-green-500 font-bold">{userData?.pontos || 0}</span>
          </div>
        </div>
      </div>

      <Card className="bg-gradient-to-br from-green-500/20 to-zinc-900 border-green-500/30 overflow-hidden relative group">
        <div className="relative z-10 py-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-black text-white italic uppercase tracking-wider">Hora do Treino</h3>
              <p className="text-zinc-400 text-sm">Registre seu progresso diário</p>
            </div>
            <div className="bg-green-500 p-3 rounded-full shadow-lg shadow-green-500/20">
              <Dumbbell className="w-6 h-6 text-black" />
            </div>
          </div>
          <Button onClick={onOpenCheckin} className="w-full h-14 text-lg">
            TREINEI HOJE 💪
          </Button>
        </div>
        <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:opacity-20 transition-opacity">
          <TrendingUp size={120} className="text-green-500" />
        </div>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Ranking Global
          </h3>
          <span className="text-xs text-zinc-500">{allUsers.length} atletas ativos</span>
        </div>

        <div className="space-y-2">
          {allUsers.length === 0 ? (
            <div className="text-center py-10 text-zinc-600">Carregando ranking...</div>
          ) : (
            allUsers.map((u, idx) => (
              <div
                key={u.uid}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                  u.uid === user?.uid
                    ? 'bg-zinc-800/50 border-green-500/50 ring-1 ring-green-500/20'
                    : 'bg-zinc-900 border-zinc-800'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 flex justify-center font-black text-zinc-600 italic">
                    {idx + 1 === 1 ? '🥇' : idx + 1 === 2 ? '🥈' : idx + 1 === 3 ? '🥉' : `#${idx + 1}`}
                  </div>
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                    <User className="w-6 h-6 text-zinc-400" />
                  </div>
                  <div>
                    <p
                      className={`font-bold flex items-center gap-1.5 ${
                        u.uid === user?.uid ? 'text-green-400' : 'text-white'
                      }`}
                    >
                      {u.nome}
                      {u.is_pro && <Crown className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                    </p>
                    <p className="text-xs text-zinc-500 uppercase tracking-tighter">
                      {u.academia || 'Treino Livre'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-white">{u.pontos || 0}</p>
                  <p className="text-[10px] text-zinc-500 uppercase">Pontos</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
