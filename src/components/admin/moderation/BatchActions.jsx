import { Button } from '../../ui/Button.jsx';
import { RejectionForm } from './RejectionModal.jsx';

export function BatchActions({
  selectedCount, busy,
  onSelectAll, onClearSelection,
  onBatchApprove,
  batchRejectConfirmOpen, onOpenBatchReject, onCloseBatchReject,
  batchRejectReasonCode, onBatchRejectReasonCode,
  batchRejectNote, onBatchRejectNote,
  batchRejectSuspected, onBatchRejectSuspected,
  batchRejectFormError, onBatchRejectFormError,
  rejectionReasons,
  onSubmitBatchReject
}) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          Seleção: <span className="text-zinc-200 font-bold">{selectedCount}</span>
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onSelectAll} className="text-xs py-2 px-3">
            Selecionar todos
          </Button>
          <Button type="button" variant="secondary" disabled={busy || selectedCount === 0} onClick={onClearSelection} className="text-xs py-2 px-3">
            Limpar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500 uppercase">
        <span className="border border-zinc-800 rounded-full px-2 py-1">Ctrl/Cmd+A selecionar tudo</span>
        <span className="border border-zinc-800 rounded-full px-2 py-1">A aprovar lote</span>
        <span className="border border-zinc-800 rounded-full px-2 py-1">R rejeitar lote</span>
        <span className="border border-zinc-800 rounded-full px-2 py-1">Esc limpar</span>
        <span className="border border-zinc-800 rounded-full px-2 py-1">G voltar lista</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" disabled={busy || selectedCount === 0} onClick={onBatchApprove} className="text-xs py-3">
          Aprovar selecionados
        </Button>
        <Button type="button" variant="outline" disabled={busy || selectedCount === 0} onClick={onOpenBatchReject} className="text-xs py-3 border-red-500/40 text-red-300 hover:bg-red-500/10">
          Rejeitar selecionados
        </Button>
      </div>

      {batchRejectConfirmOpen ? (
        <div className="border border-zinc-800 rounded-2xl p-4 bg-zinc-950/40 space-y-3">
          <p className="text-sm text-white font-bold">Rejeitar {selectedCount} itens</p>
          <RejectionForm
            reasonCode={batchRejectReasonCode}
            onReasonCode={(v) => { onBatchRejectReasonCode(v); onBatchRejectFormError(null); }}
            note={batchRejectNote}
            onNote={(v) => { onBatchRejectNote(v); onBatchRejectFormError(null); }}
            suspected={batchRejectSuspected}
            onSuspected={onBatchRejectSuspected}
            formError={batchRejectFormError}
            rejectionReasons={rejectionReasons}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={onCloseBatchReject}>Cancelar</Button>
            <Button type="button" disabled={busy} onClick={onSubmitBatchReject} className="bg-red-500/90 hover:bg-red-500 text-black font-bold">Rejeitar</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
