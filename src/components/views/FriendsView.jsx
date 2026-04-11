import { ArrowLeft } from 'lucide-react';

/**
 * Stub temporário -- será implementado no Step 4 (Componentes Frontend).
 */
export function FriendsView({ onBack }) {
  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={16} />
        Voltar
      </button>
      <h2 className="text-xl font-bold">Amigos</h2>
      <p className="text-sm text-zinc-500">Em construção...</p>
    </div>
  );
}
