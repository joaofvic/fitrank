import { useState } from 'react';
import { invokeEdge } from '../../../lib/supabase/invoke-edge.js';
import { Button } from '../../ui/Button.jsx';
import { Card } from '../../ui/Card.jsx';

function onlyDigits(v) {
  return String(v || '').replace(/\D+/g, '');
}

function formatMoneyBRL(cents) {
  const v = Number(cents || 0) / 100;
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

export function ChallengeCheckoutBricks({ supabase, desafio }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pixCpf, setPixCpf] = useState('');
  const [pixResult, setPixResult] = useState(null);

  async function handlePixPay() {
    if (!desafio?.id || !supabase) return;
    setBusy(true);
    setError(null);
    setPixResult(null);
    try {
      const cpf = onlyDigits(pixCpf);
      if (cpf.length !== 11) {
        throw new Error('Informe um CPF válido para pagar no PIX');
      }

      const { data, error: fnError } = await invokeEdge('mp-create-payment', supabase, {
        method: 'POST',
        body: {
          type: 'challenge',
          desafio_id: desafio.id,
          method: 'pix',
          payer: { identification: { type: 'CPF', number: cpf } },
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setPixResult(data);
    } catch (e) {
      setError(e?.message || 'Erro ao gerar PIX');
    } finally {
      setBusy(false);
    }
  }

  if (!desafio) return null;

  return (
    <Card className="border-zinc-800 bg-zinc-950/40 p-3 mt-3">
      <div className="min-w-0">
        <p className="text-sm font-bold">Pagamento da inscrição</p>
        <p className="text-xs text-zinc-500">
          {desafio?.nome} • {formatMoneyBRL(desafio?.entry_fee)}
        </p>
      </div>

      {error && (
        <p className="text-red-400 text-xs mt-2" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-zinc-400 font-semibold">CPF (obrigatório para PIX)</label>
          <input
            value={pixCpf}
            onChange={(e) => setPixCpf(e.target.value)}
            inputMode="numeric"
            placeholder="000.000.000-00"
            className="w-full h-10 rounded-xl bg-zinc-900 border border-zinc-800 px-3 text-sm outline-none focus:border-green-500/40"
          />
        </div>

        <Button type="button" onClick={handlePixPay} disabled={busy} className="w-full">
          {busy ? 'Gerando PIX…' : 'Gerar QR Code PIX'}
        </Button>

        {pixResult?.pix?.qr_code_base64 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
            <p className="text-xs text-zinc-400 font-semibold">Escaneie o QR Code</p>
            <img
              alt="QR Code PIX"
              className="w-52 h-52 rounded-lg bg-white p-2"
              src={`data:image/png;base64,${pixResult.pix.qr_code_base64}`}
            />
            {pixResult?.pix?.qr_code && (
              <Button
                type="button"
                variant="outline"
                onClick={() => navigator.clipboard?.writeText?.(pixResult.pix.qr_code)}
              >
                Copiar código PIX
              </Button>
            )}
            <p className="text-[11px] text-zinc-500">
              Após pagar, a confirmação pode levar alguns segundos.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
