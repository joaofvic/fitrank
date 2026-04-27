import { useCallback, useRef, useState } from 'react';
import { Camera, Image, Loader2, Type, Video, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog.jsx';

const MAX_VIDEO_DURATION_S = 15;
const CAPTION_MAX = 100;

export function StoryCreator({ onClose, onCreateStory }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isVideo, setIsVideo] = useState(false);
  const [caption, setCaption] = useState('');
  const [showCaption, setShowCaption] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const videoRef = useRef(null);

  const handleFile = useCallback((e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);

    const isVid = f.type.startsWith('video/');
    setIsVideo(isVid);
    setFile(f);
    setPreview(URL.createObjectURL(f));

    if (isVid) {
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = () => {
        if (vid.duration > MAX_VIDEO_DURATION_S) {
          setError(`Vídeo muito longo (${Math.round(vid.duration)}s). Máximo: ${MAX_VIDEO_DURATION_S}s.`);
          setFile(null);
          setPreview(null);
        }
        URL.revokeObjectURL(vid.src);
      };
      vid.src = URL.createObjectURL(f);
    }

    e.target.value = '';
  }, []);

  const handlePublish = useCallback(async () => {
    if (!file || !onCreateStory) return;
    setPublishing(true);
    setError(null);
    try {
      await onCreateStory(file, caption);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Falha ao publicar story');
    } finally {
      setPublishing(false);
    }
  }, [file, caption, onCreateStory, onClose]);

  const resetSelection = () => {
    setFile(null);
    setPreview(null);
    setCaption('');
    setShowCaption(false);
    setError(null);
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        variant="fullscreen"
        className="flex flex-col bg-black"
        showClose={false}
      >
        <DialogTitle className="sr-only">Novo Story</DialogTitle>
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button type="button" onClick={onClose} aria-label="Fechar" className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
          <X className="w-5 h-5 text-white" aria-hidden="true" />
        </button>
        {file && (
          <button
            type="button"
            onClick={() => setShowCaption((v) => !v)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${showCaption ? 'bg-green-500' : 'bg-black/50'}`}
          >
            <Type className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Inputs separados para câmera e galeria */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFile}
      />

      {!file ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-black text-white">Novo Story</h2>
            <p className="text-sm text-zinc-500">Foto ou vídeo curto (até 15s)</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-2 px-5 py-4 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-green-500/50 transition-colors"
            >
              <Camera className="w-8 h-8 text-green-400" />
              <span className="text-xs font-bold text-zinc-300">Câmera</span>
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex flex-col items-center gap-2 px-5 py-4 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 transition-colors"
            >
              <Image className="w-8 h-8 text-blue-400" />
              <span className="text-xs font-bold text-zinc-300">Galeria</span>
            </button>
          </div>
          <p className="text-[11px] text-zinc-600 text-center max-w-[240px]">
            Fotos e vídeos de até {MAX_VIDEO_DURATION_S}s. Desaparecem em 24h.
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            {isVideo ? (
              <video
                ref={videoRef}
                src={preview}
                className="max-w-full max-h-full object-contain"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <img src={preview} alt="" className="max-w-full max-h-full object-contain" />
            )}

            {showCaption && (
              <div className="absolute bottom-20 left-4 right-4">
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
                  placeholder="Adicionar legenda..."
                  maxLength={CAPTION_MAX}
                  className="w-full bg-black/60 backdrop-blur-md border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-green-500/50"
                  autoFocus
                />
                <span className={`absolute right-3 bottom-1 text-[10px] ${caption.length >= CAPTION_MAX ? 'text-red-400' : 'text-zinc-600'}`}>
                  {caption.length}/{CAPTION_MAX}
                </span>
              </div>
            )}

            {isVideo && (
              <div className="absolute top-4 right-4 px-2 py-1 rounded-full bg-black/50 flex items-center gap-1">
                <Video className="w-3 h-3 text-red-400" />
                <span className="text-[10px] font-bold text-zinc-300">VÍDEO</span>
              </div>
            )}
          </div>

          {error && (
            <div className="px-4 py-2 text-center text-xs text-red-400 bg-red-500/10">
              {error}
            </div>
          )}

          <div className="p-4 pb-8 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent">
            <button
              type="button"
              onClick={resetSelection}
              className="flex-1 py-3 rounded-xl bg-zinc-800 text-sm font-bold text-zinc-300 active:scale-95 transition-transform"
            >
              Trocar
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing || !!error}
              className="flex-[2] py-3 rounded-xl bg-green-500 text-sm font-bold text-black active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {publishing ? 'Publicando...' : 'Publicar Story'}
            </button>
          </div>
        </>
      )}
      </DialogContent>
    </Dialog>
  );
}
