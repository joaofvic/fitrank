import { Button } from '../../ui/Button.jsx';

export function RejectionForm({
  reasonCode, onReasonCode,
  note, onNote,
  suspected, onSuspected,
  formError,
  rejectionReasons
}) {
  return (
    <div className="space-y-2">
      <label className="space-y-1 block">
        <span className="text-[10px] uppercase font-bold text-zinc-500">Motivo (obrigatório)</span>
        <select
          value={reasonCode}
          onChange={(e) => onReasonCode(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
        >
          <option value="">Selecione…</option>
          {rejectionReasons.map((r) => (
            <option key={r.code} value={r.code}>{r.label}</option>
          ))}
        </select>
      </label>

      <label className="space-y-1 block">
        <span className="text-[10px] uppercase font-bold text-zinc-500">
          Observação {reasonCode === 'other' ? '(obrigatória)' : '(opcional)'}
        </span>
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          rows={3}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600"
          placeholder={reasonCode === 'other' ? 'Descreva o motivo…' : 'Opcional'}
        />
      </label>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/20 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs text-white font-bold truncate">Marcar como suspeito/fraude</p>
          <p className="text-[11px] text-zinc-500 truncate">Ajuda a priorizar e auditar.</p>
        </div>
        <input type="checkbox" checked={suspected} onChange={(e) => onSuspected(e.target.checked)} className="h-4 w-4 accent-red-500" aria-label="Marcar como suspeito/fraude" />
      </label>

      {formError ? <p className="text-xs text-red-400" role="alert">{formError}</p> : null}
    </div>
  );
}

export function RejectionPanel({
  busy,
  reasonCode, onReasonCode,
  note, onNote,
  suspected, onSuspected,
  formError, onClearFormError,
  rejectionReasons,
  onCancel, onSubmit
}) {
  return (
    <div className="border border-zinc-800 rounded-2xl p-4 bg-zinc-950/40 space-y-3">
      <p className="text-sm text-white font-bold">Rejeitar item</p>
      <RejectionForm
        reasonCode={reasonCode}
        onReasonCode={(v) => { onReasonCode(v); onClearFormError(); }}
        note={note}
        onNote={(v) => { onNote(v); onClearFormError(); }}
        suspected={suspected}
        onSuspected={onSuspected}
        formError={formError}
        rejectionReasons={rejectionReasons}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="button" disabled={busy} onClick={onSubmit} className="bg-red-500/90 hover:bg-red-500 text-black font-bold">Rejeitar</Button>
      </div>
    </div>
  );
}
