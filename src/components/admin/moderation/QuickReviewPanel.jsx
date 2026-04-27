import { useState } from 'react';
import { Button } from '../../ui/Button.jsx';
import { RejectionPanel } from './RejectionModal.jsx';
import { Dialog, DialogContent, DialogTitle } from '../../ui/dialog.jsx';

function UserContextPanel({ userContext, userContextLoading, userContextError, pct, focused, copyText }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold uppercase text-zinc-500">Contexto do usuário</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => copyText(focused.user_id)} className="text-[10px] font-bold uppercase px-2 py-1 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200" title="Copiar user_id">
            Copiar user_id
          </button>
          <button type="button" onClick={() => copyText(focused.tenant_id)} className="text-[10px] font-bold uppercase px-2 py-1 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200" title="Copiar tenant_id">
            Copiar tenant_id
          </button>
        </div>
      </div>

      {userContextLoading ? <p className="text-xs text-zinc-500">Carregando contexto…</p>
        : userContextError ? <p className="text-xs text-red-400" role="alert">{userContextError}</p>
        : userContext ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Rejeição (30d)', value: pct(userContext?.stats?.rejection_rate_30d) },
                { label: 'Check-ins (30d)', value: userContext?.stats?.total_30d ?? 0 },
                { label: 'Rejeitados (30d)', value: userContext?.stats?.rejected_30d ?? 0 },
                { label: 'Pendentes (30d)', value: userContext?.stats?.pending_30d ?? 0 }
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                  <p className="text-[10px] uppercase text-zinc-500 font-bold">{label}</p>
                  <p className="text-sm text-white font-black">{value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-[10px] uppercase text-zinc-500 font-bold">Últimos check-ins</p>
              <div className="space-y-2 max-h-56 overflow-auto pr-1">
                {(userContext?.recent_checkins ?? []).map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-2 rounded-xl border border-zinc-800 bg-black/20 p-3">
                    <div className="min-w-0">
                      <p className="text-xs text-white font-bold truncate">{c.tipo_treino || 'Treino'}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{c.checkin_local_date} · +{c.points_awarded} pts</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                      c.photo_review_status === 'rejected' ? 'bg-red-500/10 text-red-300'
                        : c.photo_review_status === 'approved' ? 'bg-green-500/10 text-green-300'
                          : 'bg-yellow-500/10 text-yellow-300'
                    }`}>
                      {c.photo_review_status}
                    </span>
                  </div>
                ))}
                {Array.isArray(userContext?.recent_checkins) && userContext.recent_checkins.length === 0 ? (
                  <p className="text-xs text-zinc-600">Sem histórico recente.</p>
                ) : null}
              </div>
            </div>
          </>
        ) : <p className="text-xs text-zinc-600">Sem dados.</p>
      }
    </div>
  );
}

function MessagePanel({
  messageTemplates, messageTemplateCode, onTemplateCode,
  messageBodyOverride, onBodyOverride,
  messageError, messageSentAt, messageSending,
  onSend
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
      <p className="text-[10px] uppercase font-bold text-zinc-500">Mensagem ao usuário</p>
      <div className="grid grid-cols-1 gap-2">
        <label className="space-y-1 block">
          <span className="text-[10px] uppercase font-bold text-zinc-500">Template</span>
          <select value={messageTemplateCode} onChange={(e) => onTemplateCode(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white">
            {messageTemplates.length === 0 ? <option value="">(sem templates)</option> : null}
            {messageTemplates.map((t) => (
              <option key={t.code} value={t.code}>{t.title || t.code}</option>
            ))}
          </select>
        </label>

        {(() => {
          const selectedTpl = messageTemplates.find((t) => t.code === messageTemplateCode);
          return selectedTpl?.body ? (
            <div className="rounded-xl border border-zinc-800 bg-black/20 p-3 space-y-1">
              <p className="text-[10px] uppercase font-bold text-zinc-500">Preview do template</p>
              <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">{selectedTpl.body}</p>
            </div>
          ) : null;
        })()}

        <label className="space-y-1 block">
          <span className="text-[10px] uppercase font-bold text-zinc-500">Editar mensagem (opcional)</span>
          <textarea value={messageBodyOverride} onChange={(e) => onBodyOverride(e.target.value)} rows={3} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600" placeholder="Se vazio, usa o texto padrão do template." />
        </label>

        {messageError ? <p className="text-xs text-red-400" role="alert">{messageError}</p> : null}
        {messageSentAt ? <p className="text-xs text-green-400">Mensagem enviada.</p> : null}

        <Button type="button" disabled={messageSending || messageTemplates.length === 0} onClick={onSend} className="text-xs py-2 px-3 bg-zinc-800 text-zinc-200 hover:bg-zinc-700">
          {messageSending ? 'Enviando…' : 'Enviar mensagem'}
        </Button>
      </div>
    </div>
  );
}

function AuditPanel({ audit, auditLoading, auditError }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-2">
      <p className="text-[10px] uppercase font-bold text-zinc-500">Histórico de decisões</p>
      {auditLoading ? <p className="text-xs text-zinc-500">Carregando…</p> : null}
      {auditError ? <p className="text-xs text-red-400" role="alert">{auditError}</p> : null}
      {!auditLoading && !auditError ? (
        <div className="space-y-2 max-h-40 overflow-auto pr-1">
          {(audit ?? []).map((a) => (
            <div key={a.id} className="text-xs text-zinc-400 border border-zinc-800 rounded-xl p-2">
              <p className="font-mono text-[10px] text-zinc-500">{a.action}</p>
              <p className="text-zinc-300">Δ {a.points_delta ?? 0} pts · {new Date(a.decided_at).toLocaleString('pt-BR')}</p>
              {a.reason_code ? <p>Motivo: {a.reason_code}</p> : null}
              {a.note ? <p>Obs: {a.note}</p> : null}
            </div>
          ))}
          {Array.isArray(audit) && audit.length === 0 ? <p className="text-xs text-zinc-600">Sem histórico.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function QuickReviewPanel({
  focused, focusedName, focusedTenant,
  busy, zoom, onToggleZoom,
  onClose, onNext, onPrev,
  onApprove, onReapprove, onOpenReject,
  rejectConfirmOpen,
  rejectReasonCode, onRejectReasonCode,
  rejectNote, onRejectNote,
  rejectSuspected, onRejectSuspected,
  rejectFormError, onClearRejectFormError,
  onCloseReject, onSubmitReject,
  rejectionReasons,
  userContext, userContextLoading, userContextError, pct, copyText,
  audit, auditLoading, auditError,
  messageTemplates, messageTemplateCode, onMessageTemplateCode,
  messageBodyOverride, onMessageBodyOverride,
  messageError, messageSentAt, messageSending, onSendMessage
}) {
  if (!focused) return null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent variant="fullscreenFloating" showClose={false}>
        <DialogTitle className="sr-only">Revisão de check-in</DialogTitle>
        <div className="w-full max-w-lg shrink-0 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/50 ring-1 ring-white/[0.06] space-y-4 mb-10 mt-[max(0.25rem,env(safe-area-inset-top,0px))]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 font-mono truncate">{focusedTenant}</p>
              <p className="text-lg font-black text-white truncate">{focusedName}</p>
              <p className="text-xs text-zinc-500 mt-1">{focused.tipo_treino} · {focused.checkin_local_date} · +{focused.points_awarded} pts</p>
            </div>
            <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-green-400">Fechar</button>
          </div>

        <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500 uppercase">
          <span className="border border-zinc-800 rounded-full px-2 py-1">A aprovar</span>
          <span className="border border-zinc-800 rounded-full px-2 py-1">R rejeitar</span>
          <span className="border border-zinc-800 rounded-full px-2 py-1">S/P pular</span>
          <span className="border border-zinc-800 rounded-full px-2 py-1">←/→ navegar</span>
          <span className="border border-zinc-800 rounded-full px-2 py-1">Z zoom</span>
          <span className="border border-zinc-800 rounded-full px-2 py-1">Esc fechar</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black">
            {focused.foto_url ? (
              <img
                src={focused.foto_url} alt=""
                className={`w-full h-80 object-contain transition-transform ${zoom ? 'scale-150 cursor-zoom-out' : 'cursor-zoom-in'}`}
                onClick={onToggleZoom}
              />
            ) : (
              <div className="h-80 flex items-center justify-center text-zinc-600 text-sm">Sem foto</div>
            )}
          </div>
          <UserContextPanel userContext={userContext} userContextLoading={userContextLoading} userContextError={userContextError} pct={pct} focused={focused} copyText={copyText} />
        </div>

        <MessagePanel
          messageTemplates={messageTemplates} messageTemplateCode={messageTemplateCode} onTemplateCode={onMessageTemplateCode}
          messageBodyOverride={messageBodyOverride} onBodyOverride={onMessageBodyOverride}
          messageError={messageError} messageSentAt={messageSentAt} messageSending={messageSending}
          onSend={onSendMessage}
        />

        {focused.photo_review_status === 'rejected' ? (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={onPrev} className="text-xs py-3">Anterior</Button>
            <Button type="button" disabled={busy} onClick={onReapprove} className="text-xs py-3 bg-green-500/90 hover:bg-green-500 text-black font-bold">Reaprovar</Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={onPrev} className="text-xs py-3">Anterior</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={onNext} className="text-xs py-3">Pular</Button>
            <Button type="button" disabled={busy} onClick={onApprove} className="text-xs py-3">Aprovar</Button>
          </div>
        )}

        {focused.photo_review_status !== 'rejected' ? (
          <Button type="button" variant="outline" disabled={busy} onClick={onOpenReject} className="w-full text-xs py-3 border-red-500/40 text-red-300 hover:bg-red-500/10">
            Rejeitar
          </Button>
        ) : null}

        <AuditPanel audit={audit} auditLoading={auditLoading} auditError={auditError} />

        {rejectConfirmOpen ? (
          <RejectionPanel
            busy={busy}
            reasonCode={rejectReasonCode} onReasonCode={onRejectReasonCode}
            note={rejectNote} onNote={onRejectNote}
            suspected={rejectSuspected} onSuspected={onRejectSuspected}
            formError={rejectFormError} onClearFormError={onClearRejectFormError}
            rejectionReasons={rejectionReasons}
            onCancel={onCloseReject} onSubmit={onSubmitReject}
          />
        ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
