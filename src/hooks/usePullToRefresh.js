import { useRef, useState, useCallback, useEffect } from 'react';

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;
const RESISTANCE = 0.4;

/**
 * Hook para pull-to-refresh nativo-like.
 *
 * @param {() => Promise<void>} onRefresh
 * @param {{ enabled?: boolean }} options
 * @returns {{ pullDistance: number, refreshing: boolean, pullRef: React.RefObject, indicatorProps: object }}
 */
export function usePullToRefresh(onRefresh, options = {}) {
  const { enabled = true } = options;
  const pullRef = useRef(null);
  const touchRef = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = useCallback((e) => {
    if (!enabled || refreshing || e.touches.length !== 1) return;

    const el = pullRef.current;
    if (!el || el.scrollTop > 5) return;

    touchRef.current = {
      startY: e.touches[0].clientY,
      pulling: false,
    };
  }, [enabled, refreshing]);

  const onTouchMove = useCallback((e) => {
    const t = touchRef.current;
    if (!t || refreshing) return;

    const el = pullRef.current;
    if (!el || el.scrollTop > 5) {
      t.pulling = false;
      setPullDistance(0);
      return;
    }

    const dy = e.touches[0].clientY - t.startY;

    if (dy > 10 && !t.pulling) {
      t.pulling = true;
    }

    if (t.pulling && dy > 0) {
      const distance = Math.min(dy * RESISTANCE, MAX_PULL);
      setPullDistance(distance);
    }
  }, [refreshing]);

  const onTouchEnd = useCallback(async () => {
    const t = touchRef.current;
    touchRef.current = null;

    if (!t?.pulling) {
      setPullDistance(0);
      return;
    }

    if (pullDistance >= PULL_THRESHOLD && onRefresh) {
      setRefreshing(true);
      try {
        await onRefresh();
      } catch { /* ignore */ }
      setRefreshing(false);
    }

    setPullDistance(0);
  }, [pullDistance, onRefresh]);

  useEffect(() => {
    const el = pullRef.current;
    if (!el) return;

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  const indicatorProps = {
    style: {
      transform: `translateY(${refreshing ? 40 : pullDistance}px)`,
      transition: pullDistance === 0 && !refreshing ? 'transform 0.2s ease-out' : 'none',
    },
  };

  return { pullDistance, refreshing, pullRef, indicatorProps };
}
