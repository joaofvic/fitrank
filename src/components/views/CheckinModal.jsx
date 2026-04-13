import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { CheckCircle2, Camera, Plus, ChevronLeft, Globe } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { MentionInput } from '../ui/MentionInput.jsx';
import { CHECKIN_GRID_WORKOUT_TYPES } from '../../lib/workout-types.js';

const CAPTION_MAX = 200;

export function CheckinModal({ onClose, onCheckin, friends = [] }) {
  const { supabase } = useAuth();
  const [foto, setFoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [exemptTipos, setExemptTipos] = useState([]);
  const inputRef = useRef(null);

  const [step, setStep] = useState('select-type');
  const [selectedType, setSelectedType] = useState(null);
  const [feedVisible, setFeedVisible] = useState(true);
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      try {
        const { data } = await supabase.rpc('checkin_photo_exempt_tipos');
        if (!cancelled && Array.isArray(data)) setExemptTipos(data);
      } catch {
        if (!cancelled) setExemptTipos([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!foto) {
      setPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(foto);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [foto]);

  const handleSelectType = (type) => {
    const canSkipPhoto = exemptTipos.includes(type);
    if (!canSkipPhoto && !foto) {
      setError('Adicione uma foto para comprovar o treino.');
      inputRef.current?.focus?.();
      return;
    }
    setError(null);
    setSelectedType(type);
    setStep('confirm');
  };

  const handleBack = () => {
    setStep('select-type');
    setSelectedType(null);
    setCaption('');
    setFeedVisible(true);
  };

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    const canSkipPhoto = exemptTipos.includes(selectedType);
    try {
      setError(null);
      const trimmed = caption.trim() || null;
      await Promise.resolve(onCheckin(selectedType, canSkipPhoto ? null : foto, feedVisible, trimmed));
    } catch (err) {
      setError(err.message ?? 'Falha ao registrar check-in.');
    } finally {
      setFoto(null);
      setSubmitting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleClose = () => {
    setFoto(null);
    setStep('select-type');
    setSelectedType(null);
    setCaption('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col justify-end p-4 animate-in-slide-modal">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-lg mx-auto space-y-6">
        <div className="flex justify-between items-center">
          {step === 'confirm' ? (
            <button type="button" onClick={handleBack} className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors">
              <ChevronLeft size={20} />
              <span className="text-sm font-semibold">Voltar</span>
            </button>
          ) : (
            <h2 className="text-xl font-bold italic uppercase tracking-wider">Registrar Treino</h2>
          )}
          <Button variant="ghost" onClick={handleClose} className="p-1 px-2 h-auto">
            Fechar
          </Button>
        </div>

        {step === 'select-type' && (
          <>
            <div className="space-y-4">
              <p className="text-zinc-400 text-sm">O que você treinou hoje?</p>
              <div className="grid grid-cols-2 gap-3">
                {CHECKIN_GRID_WORKOUT_TYPES.map((type, i) => {
                  const isLast = i === CHECKIN_GRID_WORKOUT_TYPES.length - 1;
                  const isOddTotal = CHECKIN_GRID_WORKOUT_TYPES.length % 2 !== 0;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleSelectType(type)}
                      className={`bg-zinc-800 hover:bg-green-500/10 border border-zinc-700 hover:border-green-500/50 p-4 rounded-2xl text-left transition-all group ${
                        isLast && isOddTotal ? 'col-span-2' : ''
                      }`}
                    >
                      <CheckCircle2 size={18} className="text-zinc-600 group-hover:text-green-500 mb-2 transition-colors" />
                      <span className="font-bold block text-zinc-300 group-hover:text-white">{type}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-6">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(ev) => {
                  setFoto(ev.target.files?.[0] ?? null);
                  setError(null);
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full bg-zinc-800/50 p-4 rounded-2xl flex items-center gap-4 text-left border border-zinc-800 hover:border-zinc-600 transition-colors"
              >
                <div className="w-12 h-12 bg-zinc-700 rounded-xl flex items-center justify-center border-2 border-dashed border-zinc-600 overflow-hidden shrink-0">
                  {previewUrl ? (
                    <img src={previewUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={20} className="text-zinc-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-zinc-300">
                    Foto {exemptTipos.length > 0 ? '(obrigatória exceto tipos isentos na config admin)' : '(obrigatória)'}
                  </p>
                  <p className="text-[10px] text-zinc-500 uppercase truncate">
                    {foto ? foto.name : 'Enviada com o próximo check-in'}
                  </p>
                </div>
                <Plus size={20} className="text-zinc-500 shrink-0" />
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 bg-zinc-800/60 rounded-2xl p-4 border border-zinc-700/50">
              <CheckCircle2 size={20} className="text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-500 uppercase font-bold">Tipo de treino</p>
                <p className="text-white font-bold truncate">{selectedType}</p>
              </div>
              {previewUrl && (
                <img src={previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              )}
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setFeedVisible((v) => !v)}
                className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl border transition-colors bg-zinc-800/40 border-zinc-700/50 hover:border-zinc-600"
              >
                <div className="flex items-center gap-3">
                  <Globe size={18} className={feedVisible ? 'text-green-400' : 'text-zinc-600'} />
                  <div className="text-left">
                    <p className="text-sm font-bold text-white">Postar no Feed</p>
                    <p className="text-[11px] text-zinc-500">Seus amigos verão este treino</p>
                  </div>
                </div>
                <div className={`w-11 h-6 rounded-full relative transition-colors ${feedVisible ? 'bg-green-500' : 'bg-zinc-700'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${feedVisible ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </div>
              </button>

              {feedVisible && (
                <div className="space-y-2 animate-in-fade">
                  <MentionInput
                    value={caption}
                    onChange={setCaption}
                    friends={friends}
                    maxLength={CAPTION_MAX}
                    placeholder="Escreva uma legenda... Use @amigo para mencionar (opcional)"
                    rows={3}
                    className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-3 text-sm text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-green-500/50 transition-colors"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="w-full py-4 rounded-2xl bg-green-500 text-black font-black uppercase tracking-wide text-sm hover:bg-green-400 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Registrando...' : 'Registrar Treino'}
            </button>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
