import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Dumbbell,
  Heart,
  Loader2,
  Moon,
  Shield,
  Smartphone,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-green-500' : 'bg-zinc-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60">
        <Icon size={16} className="text-zinc-400 shrink-0" />
        <span className="text-sm font-bold text-white">{title}</span>
      </div>
      <div className="divide-y divide-zinc-800/60">{children}</div>
    </div>
  );
}

function Row({ label, description, children }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-zinc-200">{label}</p>
        {description && <p className="text-[11px] text-zinc-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function TimeInput({ value, onChange, disabled, label }) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-white w-[90px] disabled:opacity-40"
    />
  );
}

const DEFAULT_PREFS = {
  enabled: true,
  training_reminder: true,
  reminder_time: '08:00',
  quiet_start: null,
  quiet_end: null,
  social: true,
  friends: true,
  achievements: true,
  admin: true,
};

export function PushPreferencesView({ supabase, userId, onBack, push }) {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [toast, setToast] = useState(null);
  const [quietEnabled, setQuietEnabled] = useState(false);

  useEffect(() => {
    if (!supabase || !userId) return;

    (async () => {
      const { data } = await supabase
        .from('push_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      const p = data ?? { ...DEFAULT_PREFS, user_id: userId };
      setPrefs(p);
      setQuietEnabled(Boolean(p.quiet_start && p.quiet_end));
      setLoading(false);
    })();
  }, [supabase, userId]);

  const update = useCallback((key, value) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!supabase || !prefs) return;
    setSaving(true);

    const payload = {
      user_id: userId,
      enabled: prefs.enabled,
      training_reminder: prefs.training_reminder,
      reminder_time: prefs.reminder_time || '08:00',
      quiet_start: quietEnabled ? (prefs.quiet_start || '22:00') : null,
      quiet_end: quietEnabled ? (prefs.quiet_end || '07:00') : null,
      social: prefs.social,
      friends: prefs.friends,
      achievements: prefs.achievements,
      admin: prefs.admin,
    };

    const { error } = await supabase
      .from('push_preferences')
      .upsert(payload, { onConflict: 'user_id' });

    setSaving(false);

    if (error) {
      console.error('push_preferences upsert', error);
      setToast({ type: 'error', message: 'Erro ao salvar' });
    } else {
      setToast({ type: 'success', message: 'Preferências salvas' });
    }

    setTimeout(() => setToast(null), 2500);
  }, [supabase, userId, prefs, quietEnabled]);

  if (loading) {
    return (
      <div className="animate-in-fade flex items-center justify-center py-20">
        <Loader2 size={24} className="text-zinc-500 animate-spin" />
      </div>
    );
  }

  const disabled = !prefs?.enabled;

  return (
    <div className="animate-in-fade -mx-4 px-4 space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={16} className="text-zinc-400" aria-hidden="true" />
        </button>
        <h2 className="text-base font-black tracking-tight">Notificações</h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-bold text-green-400 hover:text-green-300 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {/* Device registration status */}
      {push && (
        <Section icon={Smartphone} title="Este Dispositivo">
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center gap-2">
              {push.isRegistered ? (
                <>
                  <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                  <span className="text-sm text-green-400 font-medium">Push ativo neste dispositivo</span>
                </>
              ) : push.permissionStatus === 'denied' ? (
                <>
                  <XCircle size={16} className="text-red-400 shrink-0" />
                  <span className="text-sm text-red-400 font-medium">Permissão bloqueada pelo navegador</span>
                </>
              ) : (
                <>
                  <BellOff size={16} className="text-zinc-500 shrink-0" />
                  <span className="text-sm text-zinc-400">Push não registrado neste dispositivo</span>
                </>
              )}
            </div>

            {push.permissionStatus === 'denied' && (
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Para reativar, abra as configurações do navegador &gt; Notificações e permita para este site.
              </p>
            )}

            {!push.isRegistered && push.permissionStatus !== 'denied' && (
              <button
                type="button"
                disabled={registering}
                onClick={async () => {
                  setRegistering(true);
                  const ok = await push.requestPermission();
                  setRegistering(false);
                  setToast({
                    type: ok ? 'success' : 'error',
                    message: ok ? 'Push ativado!' : 'Não foi possível ativar',
                  });
                  setTimeout(() => setToast(null), 2500);
                }}
                className="w-full py-2.5 rounded-xl bg-green-500 text-black font-bold text-sm hover:bg-green-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {registering ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <BellRing size={16} />
                )}
                {registering ? 'Ativando…' : 'Ativar push neste dispositivo'}
              </button>
            )}

            {push.isRegistered && (
              <button
                type="button"
                onClick={async () => {
                  await push.removeToken();
                  setToast({ type: 'success', message: 'Push desativado neste dispositivo' });
                  setTimeout(() => setToast(null), 2500);
                }}
                className="w-full py-2 rounded-xl bg-zinc-800 text-zinc-400 font-semibold text-xs hover:bg-zinc-700 transition-colors"
              >
                Desativar push neste dispositivo
              </button>
            )}
          </div>
        </Section>
      )}

      {/* Master switch */}
      <Section icon={prefs?.enabled ? Bell : BellOff} title="Preferências do Servidor">
        <Row label="Receber notificações" description="Controla o envio para todos os dispositivos">
          <Toggle checked={prefs?.enabled ?? true} onChange={(v) => update('enabled', v)} />
        </Row>
      </Section>

      {/* Lembretes */}
      <Section icon={Dumbbell} title="Lembretes de Treino">
        <Row label="Lembrete diário" description="Receba um lembrete para treinar se ainda não fez check-in">
          <Toggle checked={prefs?.training_reminder ?? true} onChange={(v) => update('training_reminder', v)} disabled={disabled} />
        </Row>
        <Row label="Horário do lembrete">
          <TimeInput value={prefs?.reminder_time} onChange={(v) => update('reminder_time', v)} disabled={disabled} label="Horário do lembrete" />
        </Row>
      </Section>

      {/* Social */}
      <Section icon={Heart} title="Social">
        <Row label="Curtidas e comentários" description="Quando alguém curtir ou comentar no seu treino">
          <Toggle checked={prefs?.social ?? true} onChange={(v) => update('social', v)} disabled={disabled} />
        </Row>
      </Section>

      {/* Amigos */}
      <Section icon={Users} title="Amigos">
        <Row label="Solicitações e aceitações" description="Quando alguém te adicionar ou aceitar sua solicitação">
          <Toggle checked={prefs?.friends ?? true} onChange={(v) => update('friends', v)} disabled={disabled} />
        </Row>
      </Section>

      {/* Conquistas */}
      <Section icon={Trophy} title="Conquistas">
        <Row label="Badges, ligas e streaks" description="Conquistas, promoções de liga e recuperação de streak">
          <Toggle checked={prefs?.achievements ?? true} onChange={(v) => update('achievements', v)} disabled={disabled} />
        </Row>
      </Section>

      {/* Admin */}
      <Section icon={Shield} title="Administração">
        <Row label="Moderação" description="Atualizações sobre check-ins e fotos revisadas">
          <Toggle checked={prefs?.admin ?? true} onChange={(v) => update('admin', v)} disabled={disabled} />
        </Row>
      </Section>

      {/* Quiet hours */}
      <Section icon={Moon} title="Horário Silencioso">
        <Row label="Não perturbe" description="Bloquear push durante um período">
          <Toggle checked={quietEnabled} onChange={(v) => {
            setQuietEnabled(v);
            if (v && !prefs?.quiet_start) {
              update('quiet_start', '22:00');
              update('quiet_end', '07:00');
            }
          }} disabled={disabled} />
        </Row>
        {quietEnabled && (
          <>
            <Row label="Início">
              <TimeInput value={prefs?.quiet_start} onChange={(v) => update('quiet_start', v)} disabled={disabled} label="Início do silêncio" />
            </Row>
            <Row label="Fim">
              <TimeInput value={prefs?.quiet_end} onChange={(v) => update('quiet_end', v)} disabled={disabled} label="Fim do silêncio" />
            </Row>
          </>
        )}
      </Section>

      <p className="text-[11px] text-zinc-600 text-center px-4">
        Horários são em UTC. Ajuste considerando seu fuso horário.
      </p>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in-slide-up">
          <div className={`px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold ${
            toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-green-500/90 text-black'
          }`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
