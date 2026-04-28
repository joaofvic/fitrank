import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider.jsx';
import { Button } from '../ui/Button.jsx';
import { analytics } from '../../lib/analytics.js';

export function AuthScreen() {
  const { supabase } = useAuth();
  /** signin | signup | forgot */
  const [mode, setMode] = useState('signin');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [phoneDdd, setPhoneDdd] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [academia, setAcademia] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const usernameDebounceRef = useRef(null);
  const [phoneStatus, setPhoneStatus] = useState(null);
  const [phoneChecking, setPhoneChecking] = useState(false);
  const phoneDebounceRef = useRef(null);
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const emailDebounceRef = useRef(null);

  const recoveryRedirectTo = () =>
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname || '/'}` : undefined;

  const digitsOnly = (v) => String(v ?? '').replace(/\D/g, '');
  const phoneDddDigits = digitsOnly(phoneDdd).slice(0, 2);
  const phoneNumberDigits = digitsOnly(phoneNumber).slice(0, 8);

  const phoneFormatted =
    phoneDddDigits.length === 0 && phoneNumberDigits.length === 0
      ? ''
      : phoneDddDigits.length < 2
        ? `(${phoneDddDigits}`
        : phoneNumberDigits.length === 0
          ? `(${phoneDddDigits}) `
          : `(${phoneDddDigits}) 9 ${phoneNumberDigits.slice(0, 4)}${phoneNumberDigits.length > 4 ? `-${phoneNumberDigits.slice(4)}` : ''}`;

  useEffect(() => {
    if (mode !== 'signup') return;
    const raw = username.trim().toLowerCase().replace(/[^a-z0-9._]/g, '');
    if (raw !== username) setUsername(raw);
  }, [username, mode]);

  useEffect(() => {
    if (mode !== 'signup') return;
    const trimmed = username.trim();
    if (!trimmed || trimmed.length < 3) {
      setUsernameStatus(trimmed.length > 0 ? 'short' : null);
      return;
    }
    setUsernameChecking(true);
    setUsernameStatus(null);

    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    usernameDebounceRef.current = setTimeout(async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc('check_username_available', { p_username: trimmed });
        if (rpcErr) throw rpcErr;
        setUsernameStatus(data ? 'available' : 'taken');
      } catch {
        setUsernameStatus(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 500);

    return () => {
      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    };
  }, [username, mode, supabase]);

  useEffect(() => {
    if (mode !== 'signup') return;
    const digits = phoneDddDigits + phoneNumberDigits;
    if (!digits) {
      setPhoneStatus(null);
      return;
    }
    if (digits.length < 10) {
      setPhoneStatus('short');
      return;
    }
    setPhoneChecking(true);
    setPhoneStatus(null);

    if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current);
    phoneDebounceRef.current = setTimeout(async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc('check_phone_available', { p_phone: phoneFormatted });
        if (rpcErr) throw rpcErr;
        setPhoneStatus(data ? 'available' : 'taken');
      } catch {
        setPhoneStatus(null);
      } finally {
        setPhoneChecking(false);
      }
    }, 500);

    return () => {
      if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current);
    };
  }, [phoneDddDigits, phoneNumberDigits, phoneFormatted, mode, supabase]);

  useEffect(() => {
    if (mode !== 'signup') return;
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailStatus(null);
      return;
    }
    // validação simples antes de chamar RPC
    if (!trimmed.includes('@')) {
      setEmailStatus('invalid');
      return;
    }

    setEmailChecking(true);
    setEmailStatus(null);

    if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current);
    emailDebounceRef.current = setTimeout(async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc('check_email_available', { p_email: trimmed });
        if (rpcErr) throw rpcErr;
        setEmailStatus(data ? 'available' : 'taken');
      } catch {
        setEmailStatus(null);
      } finally {
        setEmailChecking(false);
      }
    }, 500);

    return () => {
      if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current);
    };
  }, [email, mode, supabase]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: recoveryRedirectTo()
        });
        if (err) throw err;
        analytics.authPasswordReset();
        setInfo(
          'Se existir uma conta com este e-mail, você receberá um link para redefinir a senha. Verifique a caixa de entrada e o spam.'
        );
      } else if (mode === 'signup') {
        const nome = displayName.trim();
        if (!nome) {
          setError('Informe seu nome.');
          setBusy(false);
          return;
        }
        const u = username.trim().toLowerCase();
        if (!u || u.length < 3) {
          setError('Informe um nome de usuário (mínimo 3 caracteres).');
          setBusy(false);
          return;
        }
        if (usernameStatus === 'taken') {
          setError('Nome de usuário já está em uso.');
          setBusy(false);
          return;
        }
        const digits10 = phoneDddDigits + phoneNumberDigits;
        if (!digits10) {
          setError('Informe seu telefone.');
          setBusy(false);
          return;
        }
        if (digits10.length !== 10) {
          setError('Informe um telefone válido: DDD + 8 números.');
          setBusy(false);
          return;
        }
        if (phoneStatus === 'taken') {
          setError('Telefone já está em uso.');
          setBusy(false);
          return;
        }
        if (emailStatus === 'taken') {
          setError('E-mail já está em uso.');
          setBusy(false);
          return;
        }
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: nome,
              academia: academia.trim() || undefined,
              username: u,
              phone: phoneFormatted
            }
          }
        });
        if (err) throw err;
        if (data?.user) {
          analytics.authSignup();
        }
        if (data?.user && !data.session) {
          setInfo(
            'Conta criada. Se o projeto exigir confirmação por e-mail, abra o link enviado antes de entrar.'
          );
        }
      } else {
        const identifier = loginIdentifier.trim();
        const { data, error: fnErr } = await supabase.functions.invoke('auth-login', {
          body: { identifier, password }
        });
        if (fnErr) throw fnErr;
        if (!data?.ok) {
          throw new Error(data?.error || 'Credenciais inválidas');
        }
        const access_token = data?.access_token;
        const refresh_token = data?.refresh_token;
        if (!access_token || !refresh_token) throw new Error('Falha ao autenticar');
        const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
        if (setErr) throw setErr;
        analytics.authLogin();
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
            {mode === 'signin' && 'Entre na sua conta'}
            {mode === 'signup' && 'Crie sua conta'}
            {mode === 'forgot' && 'Recuperar senha'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <label htmlFor="displayName" className="block text-xs font-bold text-zinc-500 uppercase mb-1">
                  Nome <span className="text-red-400">*</span>
                </label>
                <input
                  id="displayName"
                  type="text"
                  required
                  autoComplete="name"
                  value={displayName}
                  onChange={(ev) => setDisplayName(ev.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                />
              </div>
              <div>
                <label htmlFor="username" className="block text-xs font-bold text-zinc-500 uppercase mb-1">
                  Nome de usuário <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">@</span>
                  <input
                    id="username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={30}
                    autoComplete="username"
                    placeholder="seu_username"
                    value={username}
                    onChange={(ev) => setUsername(ev.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                  />
                </div>
                {usernameChecking && (
                  <p className="text-[11px] text-zinc-500 px-1 mt-1">Verificando disponibilidade…</p>
                )}
                {!usernameChecking && usernameStatus === 'taken' && (
                  <p className="text-[11px] text-red-400 px-1 mt-1">Este nome de usuário já está em uso</p>
                )}
                {!usernameChecking && usernameStatus === 'short' && (
                  <p className="text-[11px] text-zinc-500 px-1 mt-1">Mínimo de 3 caracteres</p>
                )}
                {!usernameChecking && usernameStatus === 'available' && (
                  <p className="text-[11px] text-green-500 px-1 mt-1">Disponível</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">
                  Telefone <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-[88px_1fr] gap-3">
                  <input
                    aria-label="DDD"
                    type="tel"
                    required
                    inputMode="numeric"
                    autoComplete="tel-area-code"
                    placeholder="11"
                    value={phoneDddDigits}
                    onChange={(ev) => setPhoneDdd(digitsOnly(ev.target.value))}
                    maxLength={2}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                  />
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">9</span>
                    <input
                      aria-label="Número (8 dígitos)"
                      type="tel"
                      required
                      inputMode="numeric"
                      autoComplete="tel-local"
                      placeholder="1234-5678"
                      value={phoneNumberDigits.length <= 4 ? phoneNumberDigits : `${phoneNumberDigits.slice(0, 4)}-${phoneNumberDigits.slice(4)}`}
                      onChange={(ev) => setPhoneNumber(digitsOnly(ev.target.value))}
                      maxLength={9}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                    />
                  </div>
                </div>
                {phoneChecking && (
                  <p className="text-[11px] text-zinc-500 px-1 mt-1">Verificando telefone…</p>
                )}
                {!phoneChecking && phoneStatus === 'short' && (
                  <p className="text-[11px] text-zinc-500 px-1 mt-1">Digite DDD + 8 números</p>
                )}
                {!phoneChecking && phoneStatus === 'taken' && (
                  <p className="text-[11px] text-red-400 px-1 mt-1">Este telefone já está em uso</p>
                )}
                {!phoneChecking && phoneStatus === 'available' && (
                  <p className="text-[11px] text-green-500 px-1 mt-1">Telefone disponível</p>
                )}
                {!phoneChecking && !phoneStatus && (
                  <p className="text-[11px] text-zinc-500 px-1 mt-1">
                    Digite DDD e o número.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="email" className="block text-xs font-bold text-zinc-500 uppercase mb-1">
                  E-mail <span className="text-red-400">*</span>
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
                {emailChecking && (
                  <p className="text-[11px] text-zinc-500 px-1 mt-1">Verificando e-mail…</p>
                )}
                {!emailChecking && emailStatus === 'invalid' && (
                  <p className="text-[11px] text-zinc-500 px-1 mt-1">Informe um e-mail válido</p>
                )}
                {!emailChecking && emailStatus === 'taken' && (
                  <p className="text-[11px] text-red-400 px-1 mt-1">Este e-mail já está em uso</p>
                )}
                {!emailChecking && emailStatus === 'available' && (
                  <p className="text-[11px] text-green-500 px-1 mt-1">E-mail disponível</p>
                )}
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
            </>
          )}
          {mode === 'signin' && (
            <div>
              <label htmlFor="identifier" className="block text-xs font-bold text-zinc-500 uppercase mb-1">
                Número de celular, nome de usuário ou email
              </label>
              <input
                id="identifier"
                type="text"
                required
                autoComplete="username"
                placeholder=""
                value={loginIdentifier}
                onChange={(ev) => setLoginIdentifier(ev.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
              />
            </div>
          )}
          {mode === 'forgot' && (
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
          )}
          {mode !== 'forgot' && (
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
          )}

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
            {busy
              ? 'Aguarde…'
              : mode === 'forgot'
                ? 'Enviar link'
                : mode === 'signin'
                  ? 'Entrar'
                  : 'Cadastrar'}
          </Button>
        </form>

        {mode === 'signin' && (
          <button
            type="button"
            onClick={() => {
              setMode('forgot');
              setError(null);
              setInfo(null);
              setPassword('');
            }}
            className="w-full text-center text-sm text-zinc-500 hover:text-green-400 transition-colors"
          >
            Esqueci minha senha
          </button>
        )}

        {mode === 'forgot' ? (
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError(null);
              setInfo(null);
            }}
            className="w-full text-center text-sm text-zinc-500 hover:text-green-400 transition-colors"
          >
            Voltar ao login
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
              setInfo(null);
              setLoginIdentifier('');
            }}
            className="w-full text-center text-sm text-zinc-500 hover:text-green-400 transition-colors"
          >
            {mode === 'signin' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
          </button>
        )}
      </div>
    </div>
  );
}
