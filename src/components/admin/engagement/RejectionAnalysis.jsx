import { Card } from '../../ui/Card.jsx';
import { fmtPct, fmtDateTime, rejectionReasonLabel } from './engagement-helpers.jsx';

export function RejectionAnalysis({
  rejectionRanking,
  rejectionTotalKnown,
  rejectReasonCode,
  onPickRejectionReason,
  rejectExamples,
  rejectExamplesLoading,
  rejectExamplesError
}) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-black text-zinc-300 uppercase">Análise de rejeições</h3>
          <p className="text-[10px] text-zinc-500 mt-1">
            Usa o mesmo período e tenant dos filtros acima. Clique em um motivo para ver exemplos reais.
          </p>
        </div>
        {rejectionTotalKnown != null ? (
          <p className="text-xs text-zinc-400 font-mono shrink-0">
            Total: <span className="text-white font-black">{rejectionTotalKnown}</span> rejeições
          </p>
        ) : null}
      </div>
      {rejectionRanking.length === 0 ? (
        <p className="text-xs text-zinc-500">Nenhuma rejeição no período.</p>
      ) : (
        <ul className="space-y-2">
          {rejectionRanking.map((r) => {
            const pct = typeof r.pct === 'number' && Number.isFinite(r.pct) ? r.pct : null;
            const active = rejectReasonCode === r.code;
            return (
              <li key={r.code}>
                <button
                  type="button"
                  onClick={() => onPickRejectionReason(r.code)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                    active
                      ? 'border-green-500/50 bg-green-500/10'
                      : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono text-zinc-500 w-6 shrink-0">#{r.rank}</span>
                      <span className="text-sm text-zinc-100 truncate font-bold">
                        {rejectionReasonLabel(r.code)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-zinc-500 font-mono">{r.count}</span>
                      <span className="text-xs text-green-400 font-mono w-14 text-right">
                        {pct != null ? fmtPct(pct) : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500/70"
                      style={{ width: pct != null ? `${Math.min(100, Math.round(pct * 1000) / 10)}%` : '0%' }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {rejectReasonCode ? (
        <div className="rounded-xl border border-zinc-800 bg-black/30 p-3 space-y-3" role="region" aria-label="Exemplos rejeitados do motivo selecionado">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black text-white">
              Exemplos: {rejectionReasonLabel(rejectReasonCode)}
            </p>
            <button type="button" className="text-[10px] text-zinc-500 hover:text-green-400" onClick={() => onPickRejectionReason(rejectReasonCode)}>
              Fechar
            </button>
          </div>
          {rejectExamplesLoading ? <p className="text-xs text-zinc-500">Carregando exemplos…</p> : null}
          {rejectExamplesError ? (
            <p className="text-xs text-red-400" role="alert">
              {rejectExamplesError}
              <span className="block text-[10px] text-zinc-600 mt-1">
                Confirme se a migration <span className="font-mono">admin_rejection_examples</span> foi aplicada no projeto.
              </span>
            </p>
          ) : null}
          {!rejectExamplesLoading && !rejectExamplesError && rejectExamples.length === 0 ? (
            <p className="text-xs text-zinc-500">Nenhum exemplo encontrado para esse motivo no período.</p>
          ) : null}
          <div className="grid grid-cols-1 gap-3">
            {rejectExamples.map((ex) => (
              <div key={ex.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80 overflow-hidden flex flex-col sm:flex-row gap-3 p-3">
                <div className="sm:w-36 shrink-0">
                  {ex.foto_url ? (
                    <a href={ex.foto_url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-zinc-800">
                      <img src={ex.foto_url} alt="" className="w-full h-32 sm:h-28 object-cover" loading="lazy" />
                    </a>
                  ) : (
                    <div className="h-32 sm:h-28 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] text-zinc-600">
                      Sem foto
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-xs">
                  <p className="text-zinc-500 font-mono text-[10px]">{ex.id}</p>
                  <p className="text-white font-bold">
                    {ex.tipo_treino ?? '—'}{' '}
                    <span className="text-zinc-500 font-normal">· {ex.checkin_local_date ?? '—'}</span>
                  </p>
                  <p className="text-zinc-500">
                    {ex.tenant_name || ex.tenant_slug ? (
                      <>
                        Academia: <span className="text-zinc-300">{ex.tenant_name ?? ex.tenant_slug}</span>
                        {ex.tenant_slug ? <span className="text-zinc-600 font-mono ml-1">({ex.tenant_slug})</span> : null}
                      </>
                    ) : 'Academia: —'}
                  </p>
                  <p className="text-zinc-500">
                    Rejeitado em <span className="text-zinc-300">{fmtDateTime(ex.photo_reviewed_at)}</span>
                  </p>
                  {ex.photo_rejection_note ? (
                    <p className="text-zinc-400 border-l-2 border-zinc-700 pl-2 mt-2">{ex.photo_rejection_note}</p>
                  ) : null}
                  <p className="text-[10px] text-zinc-600 font-mono">user_id: {ex.user_id ?? '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
