import { useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';

export function AuthScreen({ supabase, defaultTenantSlug = 'demo', onAuthed }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState(defaultTenantSlug);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              tenant_slug: tenantSlug.trim() || defaultTenantSlug,
              display_name: displayName.trim() || email.split('@')[0]
            }
          }
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      onAuthed?.();
    } catch (err) {
      setError(err.message ?? 'Erro de autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/80 p-8 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600 uppercase">
            FitRank
          </h1>
          <p className="text-zinc-500 text-sm">{mode === 'login' ? 'Entrar' : 'Criar conta'}</p>
        </div>

        <div className="flex rounded-xl bg-zinc-950 p-1 border border-zinc-800">
          <button
            type="button"
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
              mode === 'login' ? 'bg-green-500 text-black' : 'text-zinc-500'
            }`}
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
              mode === 'signup' ? 'bg-green-500 text-black' : 'text-zinc-500'
            }`}
            onClick={() => setMode('signup')}
          >
            Cadastro
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label className="text-xs text-zinc-500 uppercase font-bold block mb-1">Nome</label>
                <input
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
                  value={displayName}
                  onChange={(ev) => setDisplayName(ev.target.value)}
                  placeholder="Como quer aparecer no ranking"
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 uppercase font-bold block mb-1">Código da academia (slug)</label>
                <input
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
                  value={tenantSlug}
                  onChange={(ev) => setTenantSlug(ev.target.value)}
                  placeholder="demo"
                  autoComplete="off"
                />
              </div>
            </>
          )}
          <div>
            <label className="text-xs text-zinc-500 uppercase font-bold block mb-1">E-mail</label>
            <input
              type="email"
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase font-bold block mb-1">Senha</label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Button type="submit" className="w-full h-12" disabled={loading}>
            {loading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Cadastrar'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
