import { useState } from 'react';
import { Download, Loader2, MessageCircle, X } from 'lucide-react';
import { generateShareCard } from '../../lib/share-card.js';
import { logger } from '../../lib/logger.js';

const INSTAGRAM_ICON = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * Bottom sheet para compartilhar um post do feed.
 * @param {{ post: object, onClose: () => void, onTrackShare?: (checkinId: string, platform: string) => void }} props
 */
export function ShareDrawer({ post, onClose, onTrackShare }) {
  const [generating, setGenerating] = useState(false);
  const [sharingPlatform, setSharingPlatform] = useState(null);

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  const canShareFiles = typeof navigator !== 'undefined' && !!navigator.canShare;

  const buildCardData = () => ({
    fotoUrl: post.foto_url ?? null,
    displayName: post.display_name ?? 'Atleta',
    workoutType: post.workout_type ?? 'Treino',
    points: post.points_earned ?? 10,
    streak: post.streak ?? 0
  });

  const handleInstagram = async () => {
    setSharingPlatform('instagram');
    setGenerating(true);
    try {
      const blob = await generateShareCard(buildCardData());
      const file = new File([blob], 'fitrank-treino.png', { type: 'image/png' });

      if (canShareFiles && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'FitRank',
          text: `💪 Treinei ${post.workout_type ?? 'hoje'} e ganhei +${post.points_earned ?? 10} pontos no FitRank!`
        });
        onTrackShare?.(post.id, 'instagram');
      } else {
        downloadBlob(blob, 'fitrank-treino.png');
        onTrackShare?.(post.id, 'instagram');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        logger.error('share instagram', err);
      }
    } finally {
      setGenerating(false);
      setSharingPlatform(null);
    }
  };

  const handleWhatsApp = async () => {
    setSharingPlatform('whatsapp');
    setGenerating(true);
    try {
      const text = `💪 Treinei ${post.workout_type ?? 'hoje'} e ganhei +${post.points_earned ?? 10} pontos no FitRank!\n\nBaixe o app: https://fitrank.app`;

      if (canNativeShare) {
        const shareData = { title: 'FitRank', text };

        if (post.foto_url && canShareFiles) {
          try {
            const resp = await fetch(post.foto_url, { mode: 'cors' });
            const imgBlob = await resp.blob();
            const file = new File([imgBlob], 'treino.jpg', { type: imgBlob.type || 'image/jpeg' });
            if (navigator.canShare({ files: [file] })) {
              shareData.files = [file];
            }
          } catch {
            // foto cross-origin, envia só texto
          }
        }

        await navigator.share(shareData);
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
      onTrackShare?.(post.id, 'whatsapp');
    } catch (err) {
      if (err.name !== 'AbortError') {
        logger.error('share whatsapp', err);
      }
    } finally {
      setGenerating(false);
      setSharingPlatform(null);
    }
  };

  const handleDownload = async () => {
    setSharingPlatform('download');
    setGenerating(true);
    try {
      const blob = await generateShareCard(buildCardData());
      downloadBlob(blob, 'fitrank-treino.png');
      onTrackShare?.(post.id, 'other');
    } catch (err) {
      logger.error('share download', err);
    } finally {
      setGenerating(false);
      setSharingPlatform(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in-fade"
        onClick={onClose}
      />

      <div className="relative max-w-lg w-full mx-auto bg-zinc-900 border-t border-zinc-800 rounded-t-2xl p-5 pb-8 animate-in-slide-up">
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-5" />

        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-black uppercase tracking-wide text-zinc-300">
            Compartilhar
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <ShareOption
            icon={<INSTAGRAM_ICON />}
            label="Instagram Stories"
            sublabel={!canShareFiles ? 'Salvar imagem' : undefined}
            loading={generating && sharingPlatform === 'instagram'}
            disabled={generating}
            onClick={handleInstagram}
            color="text-pink-400"
          />
          <ShareOption
            icon={<MessageCircle className="w-6 h-6" />}
            label="WhatsApp"
            loading={generating && sharingPlatform === 'whatsapp'}
            disabled={generating}
            onClick={handleWhatsApp}
            color="text-green-400"
          />
          <ShareOption
            icon={<Download className="w-6 h-6" />}
            label="Salvar Card"
            loading={generating && sharingPlatform === 'download'}
            disabled={generating}
            onClick={handleDownload}
            color="text-blue-400"
          />
        </div>

        {!canShareFiles && (
          <p className="text-[11px] text-zinc-600 text-center mt-4">
            Dica: no celular, a imagem será compartilhada diretamente. No desktop, ela será salva para você adicionar manualmente.
          </p>
        )}
      </div>
    </div>
  );
}

function ShareOption({ icon, label, sublabel, loading, disabled, onClick, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-800/40 p-4 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-green-500" />
      ) : (
        <span className={color}>{icon}</span>
      )}
      <span className="text-[11px] font-bold uppercase tracking-wide leading-tight text-center">
        {label}
      </span>
      {sublabel && (
        <span className="text-[9px] text-zinc-600 -mt-1">{sublabel}</span>
      )}
    </button>
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
