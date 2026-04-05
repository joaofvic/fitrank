import { User, Camera, Flame, Zap, Calendar, CheckCircle2, Crown, LogOut } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';

export function ProfileView({ userData, checkins, onLogout, onUpgradePro, onOpenPortal, hasStripePrice }) {
  const created = userData?.created_at
    ? new Date(userData.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="space-y-6 animate-in-fade">
      <div className="text-center space-y-4">
        <div className="relative inline-block">
          <div className="w-24 h-24 rounded-full bg-zinc-800 border-4 border-zinc-700 flex items-center justify-center mx-auto shadow-2xl shadow-green-500/10">
            <User size={48} className="text-zinc-500" />
          </div>
          <div className="absolute bottom-0 right-0 bg-green-500 p-2 rounded-full border-4 border-black">
            <Camera size={16} className="text-black" />
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-black">{userData?.nome}</h2>
          <p className="text-zinc-500">Desde {created}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col items-center justify-center py-6 border-orange-500/20">
          <Flame className="w-8 h-8 text-orange-500 fill-orange-500 mb-2" />
          <span className="text-2xl font-black">{userData?.streak || 0}</span>
          <span className="text-xs text-zinc-500 uppercase">Dias Seguidos</span>
        </Card>
        <Card className="flex flex-col items-center justify-center py-6 border-green-500/20">
          <Zap className="w-8 h-8 text-green-500 fill-green-500 mb-2" />
          <span className="text-2xl font-black">{userData?.pontos || 0}</span>
          <span className="text-xs text-zinc-500 uppercase">Total Pontos</span>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="font-bold flex items-center gap-2">
          <Calendar className="w-5 h-5 text-zinc-400" />
          Histórico de Treinos
        </h3>

        {checkins.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-600">
            Você ainda não registrou nenhum treino.
          </div>
        ) : (
          <div className="space-y-3">
            {checkins.map((c) => (
              <div
                key={c.id}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <p className="font-bold text-white">{c.type}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(c.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="bg-green-500/10 text-green-500 px-2 py-1 rounded text-xs font-bold">
                  +10 PTS
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Card className="bg-zinc-800/30 border-dashed border-zinc-700">
        <h4 className="font-bold mb-1 flex items-center gap-2">
          <Crown className="w-4 h-4 text-yellow-500" />
          Seja um Membro PRO
        </h4>
        <p className="text-sm text-zinc-500 mb-4">Badges exclusivos, estatísticas avançadas e portal de cobrança.</p>
        <div className="flex flex-col gap-2">
          {hasStripePrice && (
            <Button variant="outline" className="w-full py-2" onClick={() => onUpgradePro?.()}>
              Assinar PRO (Stripe)
            </Button>
          )}
          {userData?.is_pro && (
            <Button variant="ghost" className="w-full py-2 text-zinc-400" onClick={() => onOpenPortal?.()}>
              Gerenciar assinatura
            </Button>
          )}
        </div>
      </Card>

      <Button
        variant="ghost"
        className="w-full text-zinc-500 flex items-center justify-center gap-2"
        onClick={() => onLogout?.()}
      >
        <LogOut size={18} />
        Sair
      </Button>
    </div>
  );
}
