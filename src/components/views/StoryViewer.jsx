import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Share2, Trash2, X } from 'lucide-react';
import { UserAvatar } from '../ui/user-avatar.jsx';

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function StoryViewer({
  userId,
  displayName,
  avatarUrl,
  stories: storiesRing,
  loadUserStories,
  onMarkViewed,
  onDeleteStory,
  onClose,
  onNextUser,
  onPrevUser,
  onShare,
  currentUserId
}) {
  const [stories, setStories] = useState([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const elapsedRef = useRef(0);
  const videoRef = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0 });

  const current = stories[idx] ?? null;
  const isOwner = userId === currentUserId;
  const duration = current?.media_type === 'video' ? (current.duration_ms ?? 5000) : 5000;

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadUserStories(userId).then((data) => {
      if (!mounted) return;
      const list = data ?? [];
      setStories(list);
      const firstUnseen = list.findIndex((s) => !s.is_viewed);
      setIdx(firstUnseen >= 0 ? firstUnseen : 0);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [userId, loadUserStories]);

  const goNext = useCallback(() => {
    if (idx < stories.length - 1) {
      setIdx(idx + 1);
    } else {
      onNextUser?.() ?? onClose();
    }
  }, [idx, stories.length, onNextUser, onClose]);

  const goPrev = useCallback(() => {
    if (idx > 0) {
      setIdx(idx - 1);
    } else {
      onPrevUser?.();
    }
  }, [idx, onPrevUser]);

  useEffect(() => {
    if (!current || loading) return;
    if (!current.is_viewed) {
      onMarkViewed?.(current.id);
    }
  }, [current?.id, loading]);

  useEffect(() => {
    if (!current || loading || paused) return;
    elapsedRef.current = 0;
    setProgress(0);
    startTimeRef.current = Date.now();

    if (current.media_type === 'video' && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }

    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(elapsed / duration, 1);
      setProgress(pct);
      if (pct >= 1) {
        goNext();
      } else {
        timerRef.current = requestAnimationFrame(tick);
      }
    };
    timerRef.current = requestAnimationFrame(tick);

    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [current?.id, loading, paused, duration, goNext]);

  const handlePause = useCallback(() => {
    setPaused(true);
    elapsedRef.current = Date.now() - (startTimeRef.current ?? Date.now());
    if (timerRef.current) cancelAnimationFrame(timerRef.current);
    if (current?.media_type === 'video' && videoRef.current) {
      videoRef.current.pause();
    }
  }, [current?.media_type]);

  const handleResume = useCallback(() => {
    setPaused(false);
    startTimeRef.current = Date.now() - elapsedRef.current;
    if (current?.media_type === 'video' && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [current?.media_type]);

  const handleTap = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.3) {
      goPrev();
    } else if (x > rect.width * 0.7) {
      goNext();
    } else {
      paused ? handleResume() : handlePause();
    }
  }, [goPrev, goNext, paused, handlePause, handleResume]);

  const handleTouchStart = useCallback((e) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    if (Math.abs(dx) > 80) {
      if (dx < 0) onNextUser?.() ?? goNext();
      else onPrevUser?.() ?? goPrev();
    }
  }, [goNext, goPrev, onNextUser, onPrevUser]);

  const handleDelete = useCallback(async () => {
    if (!current || !onDeleteStory) return;
    const ok = await onDeleteStory(current.id);
    if (ok) {
      const next = stories.filter((s) => s.id !== current.id);
      if (next.length === 0) {
        onClose();
      } else {
        setStories(next);
        setIdx(Math.min(idx, next.length - 1));
      }
    }
  }, [current, onDeleteStory, stories, idx, onClose]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!current) {
    onClose();
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col select-none">
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 px-2 pt-2">
        {stories.map((s, i) => (
          <div key={s.id} className="flex-1 h-[3px] bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-none"
              style={{
                width: i < idx ? '100%' : i === idx ? `${progress * 100}%` : '0%'
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-4 left-0 right-0 z-20 flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500/30 to-zinc-800 p-[2px] shrink-0">
            <UserAvatar src={avatarUrl} size="sm" className="w-full h-full bg-zinc-900" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white truncate">{displayName}</p>
            <p className="text-[10px] text-zinc-400">{formatTimeAgo(current.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {paused ? (
            <button type="button" onClick={handleResume} className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center">
              <Play className="w-4 h-4 text-white" />
            </button>
          ) : (
            <button type="button" onClick={handlePause} className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center">
              <Pause className="w-4 h-4 text-white" />
            </button>
          )}
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Media */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden"
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {current.media_type === 'video' ? (
          <video
            ref={videoRef}
            src={current.media_url}
            className="max-w-full max-h-full object-contain"
            playsInline
            muted={false}
          />
        ) : (
          <img
            src={current.media_url}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        )}

        {/* Navigation indicators */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-60 transition-opacity">
          <ChevronLeft className="w-8 h-8 text-white" />
        </div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-60 transition-opacity">
          <ChevronRight className="w-8 h-8 text-white" />
        </div>
      </div>

      {/* Caption + Actions */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-6 bg-gradient-to-t from-black/80 to-transparent pt-20">
        {current.caption && (
          <p className="text-sm text-white font-medium mb-3 drop-shadow-lg">
            {current.caption}
          </p>
        )}
        <div className="flex items-center gap-3">
          {isOwner && (
            <>
              <span className="text-[11px] text-zinc-400">
                {current.view_count ?? 0} visualização{(current.view_count ?? 0) !== 1 ? 'ões' : ''}
              </span>
              <div className="flex-1" />
              {onShare && (
                <button
                  type="button"
                  onClick={() => onShare(current)}
                  className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
                >
                  <Share2 className="w-4 h-4 text-white" />
                </button>
              )}
              <button
                type="button"
                onClick={handleDelete}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </>
          )}
          {!isOwner && onShare && (
            <>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => onShare(current)}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
              >
                <Share2 className="w-4 h-4 text-white" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
