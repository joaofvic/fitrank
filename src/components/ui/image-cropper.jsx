import { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import { Check, X, ZoomIn, ZoomOut } from 'lucide-react';
import { getCroppedBlob } from '../../lib/crop-image';
import { Dialog, DialogContent, DialogTitle } from './dialog.jsx';

export function ImageCropper({ open = true, imageSrc, onConfirm, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      onConfirm(file, URL.createObjectURL(blob));
    } catch {
      onCancel();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent
        className="fixed inset-0 left-0 top-0 w-full h-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-black/95 p-0 flex flex-col"
        showClose={false}
      >
        <DialogTitle className="sr-only">Ajustar foto</DialogTitle>
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={20} />
            <span className="text-sm font-semibold">Cancelar</span>
          </button>
          <span className="text-sm font-bold text-white">Ajustar foto</span>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={processing}
            className="flex items-center gap-1.5 text-green-500 hover:text-green-400 disabled:text-zinc-600 transition-colors"
          >
            <Check size={20} />
            <span className="text-sm font-semibold">
              {processing ? 'Salvando…' : 'Confirmar'}
            </span>
          </button>
        </div>

        <div className="relative flex-1 min-h-0">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            minZoom={1}
            maxZoom={3}
            style={{
              containerStyle: { background: '#000' },
              cropAreaStyle: { border: '2px solid rgba(34,197,94,0.6)' }
            }}
          />
        </div>

        <div className="flex items-center gap-3 px-6 py-4 shrink-0">
          <ZoomOut size={16} className="text-zinc-500 shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Nível de zoom"
            aria-valuemin={1}
            aria-valuemax={3}
            aria-valuenow={zoom}
            className="flex-1 h-1 accent-green-500 bg-zinc-700 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500
              [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <ZoomIn size={16} className="text-zinc-500 shrink-0" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
