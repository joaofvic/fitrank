import { useState } from 'react';
import { useAuth } from './AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';

/**
 * Exibido após o usuário abrir o link de recuperação enviado por e-mail (evento PASSWORD_RECOVERY).
 */
export function ResetPasswordScreen() {
  const { supabase, completePasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const p = password.trim();
    const c = confirm.trim();
    if (p.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (p !== c) {
      setError('As senhas não coincidem.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: p });
      if (err) throw err;
      completePasswordRecovery();
    } catch (err) {
      setError(err.message ?? 'Não foi possível atualizar a senha.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600 uppercase">
            FitRank
          </h1>
          <p className="text-zinc-500 text-sm mt-2">Defina sua nova senha</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-xs font-bold text-zinc-500 uppercase mb-1">
              Nova senha
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-xs font-bold text-zinc-500 uppercase mb-1">
              Confirmar senha
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirm}
              onChange={(ev) => setConfirm(ev.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
          </div>
          {error && (
            <p className="text-red-400 text-sm" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full py-3 rounded-xl font-bold">
            {busy ? 'Salvando…' : 'Salvar nova senha'}
          </Button>
        </form>
      </div>
    </div>
  );
}
