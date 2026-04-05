import { useState } from 'react';
import { useAuth } from './AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';

export function AuthScreen() {
  const { supabase } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [academia, setAcademia] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              tenant_slug: tenantSlug.trim() || undefined,
              display_name: displayName.trim() || undefined,
              academia: academia.trim() || undefined
            }
          }
        });
        if (err) throw err;
        if (data?.user && !data.session) {
          setInfo(
            'Conta criada. Se o projeto exigir confirmação por e-mail, abra o link enviado antes de entrar.'
          );
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (err) throw err;
      }
    } catch (err) {
      setError(err.message ?? 'Falha na autenticação');
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
          <p className="text-zinc-500 text-sm mt-2">
            {mode === 'signin' ? 'Entre na sua conta' : 'Crie sua conta'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label htmlFor="displayName" className="block text-xs font-bold text-zinc-500 uppercase mb-1">
                  Nome (opcional)
                </label>
                <input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(ev) => setDisplayName(ev.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                />
              </div>
              <div>
                <label htmlFor="academia" className="block text-xs font-bold text-zinc-500 uppercase mb-1">
                  Academia (opcional)
                </label>
                <input
                  id="academia"
                  type="text"
                  autoComplete="organization"
                  placeholder="Nome da sua academia"
                  value={academia}
                  onChange={(ev) => setAcademia(ev.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                />
              </div>
              <div>
                <label htmlFor="tenantSlug" className="block text-xs font-bold text-zinc-500 uppercase mb-1">
                  Código da academia (slug)
                </label>
                <input
                  id="tenantSlug"
                  type="text"
                  autoComplete="off"
                  placeholder="ex.: minha-academia (vazio = padrão)"
                  value={tenantSlug}
                  onChange={(ev) => setTenantSlug(ev.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                />
              </div>
            </>
          )}
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-zinc-500 uppercase mb-1">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-bold text-zinc-500 uppercase mb-1">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
          </div>

          {info && (
            <p className="text-green-400/90 text-sm" role="status">
              {info}
            </p>
          )}
          {error && (
            <p className="text-red-400 text-sm" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy} className="w-full py-3 rounded-xl font-bold">
            {busy ? 'Aguarde…' : mode === 'signin' ? 'Entrar' : 'Cadastrar'}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
          }}
          className="w-full text-center text-sm text-zinc-500 hover:text-green-400 transition-colors"
        >
          {mode === 'signin' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
        </button>
      </div>
    </div>
  );
}
