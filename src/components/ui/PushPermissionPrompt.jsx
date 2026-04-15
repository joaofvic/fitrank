import { Bell, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './dialog.jsx';

export function PushPermissionPrompt({ open, onAccept, onDismiss }) {
  if (!open) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onDismiss(); }}>
      <DialogContent className="max-w-sm mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
        <DialogTitle className="sr-only">Ativar notificações</DialogTitle>

        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
          <Bell size={24} className="text-green-400" />
        </div>

        <h3 className="text-lg font-black text-white mb-2">
          Ative as notificações
        </h3>
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
          Receba lembretes para treinar e não perca seu streak!
          Você pode personalizar tudo nas configurações.
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="w-full py-3 rounded-xl bg-green-500 text-black font-bold text-sm hover:bg-green-400 transition-colors"
          >
            Ativar notificações
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-3 rounded-xl bg-zinc-800 text-zinc-400 font-semibold text-sm hover:bg-zinc-700 transition-colors"
          >
            Agora não
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
