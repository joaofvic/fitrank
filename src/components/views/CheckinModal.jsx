import { useState } from 'react';
import { CheckCircle2, Camera, Plus } from 'lucide-react';
import { Button } from '../ui/Button.jsx';

const WORKOUT_TYPES = ['Musculação', 'Cárdio', 'Funcional', 'Luta', 'Crossfit', 'Outro'];

export function CheckinModal({ onClose, onCheckin, supabase, tenantId, userId }) {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);

  const uploadPhotoIfAny = async () => {
    if (!file || !supabase || !tenantId || !userId) return null;
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${tenantId}/${userId}/${crypto.randomUUID()}.${ext}`;
    setUploading(true);
    try {
      const { error } = await supabase.storage.from('checkin-photos').upload(path, file, {
        upsert: false,
        contentType: file.type || 'image/jpeg'
      });
      if (error) throw error;
      return path;
    } catch (e) {
      console.error(e);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handlePickType = async (type) => {
    const fotoPath = await uploadPhotoIfAny();
    await onCheckin(type, fotoPath);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col justify-end p-4 animate-in-slide-modal">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-lg mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold italic uppercase tracking-wider">Registrar Treino</h2>
          <Button variant="ghost" onClick={onClose} className="p-1 px-2 h-auto">
            Fechar
          </Button>
        </div>

        <div className="space-y-4">
          <p className="text-zinc-400 text-sm">O que você treinou hoje?</p>
          <div className="grid grid-cols-2 gap-3">
            {WORKOUT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                disabled={uploading}
                onClick={() => handlePickType(type)}
                className="bg-zinc-800 hover:bg-green-500/10 border border-zinc-700 hover:border-green-500/50 p-4 rounded-2xl text-left transition-all group disabled:opacity-50"
              >
                <CheckCircle2 size={18} className="text-zinc-600 group-hover:text-green-500 mb-2 transition-colors" />
                <span className="font-bold block text-zinc-300 group-hover:text-white">{type}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-6">
          <label className="bg-zinc-800/50 p-4 rounded-2xl flex items-center gap-4 cursor-pointer">
            <div className="w-12 h-12 bg-zinc-700 rounded-xl flex items-center justify-center border-2 border-dashed border-zinc-600">
              <Camera size={20} className="text-zinc-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-zinc-300">Adicionar foto (Opcional)</p>
              <p className="text-[10px] text-zinc-500 uppercase">
                {file ? file.name : 'Toque para escolher arquivo'}
              </p>
            </div>
            <Plus size={20} className="text-zinc-500" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
