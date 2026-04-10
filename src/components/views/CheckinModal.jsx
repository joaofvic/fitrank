import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { CheckCircle2, Camera, Plus } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { CHECKIN_GRID_WORKOUT_TYPES } from '../../lib/workout-types.js';

export function CheckinModal({ onClose, onCheckin }) {
  const { supabase } = useAuth();
  const [foto, setFoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [exemptTipos, setExemptTipos] = useState([]);
  const inputRef = useRef(null);

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

  const handleType = async (type) => {
    const canSkipPhoto = exemptTipos.includes(type);
    if (!canSkipPhoto && !foto) {
      setError('Adicione uma foto para comprovar o treino.');
      inputRef.current?.focus?.();
      return;
    }
    try {
      setError(null);
      await Promise.resolve(onCheckin(type, canSkipPhoto ? null : foto));
    } finally {
      setFoto(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col justify-end p-4 animate-in-slide-modal">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-lg mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold italic uppercase tracking-wider">Registrar Treino</h2>
          <Button
            variant="ghost"
            onClick={() => {
              setFoto(null);
              onClose();
            }}
            className="p-1 px-2 h-auto"
          >
            Fechar
          </Button>
        </div>

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
                  onClick={() => handleType(type)}
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
          {error && (
            <p className="text-xs text-red-400 mt-3" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
