import { useRef, useCallback, useEffect } from 'react';
import { TAB_VIEWS } from '../lib/view-transition.js';

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.3;
const ANGLE_MAX = 30;

/**
 * Hook para detectar swipe horizontal entre tabs da navegação principal.
 * Ignora swipe dentro de elementos com scroll horizontal (stories, carousels).
 *
 * @param {string} currentView
 * @param {(view: string) => void} onNavigate
 * @param {React.RefObject<HTMLElement>} containerRef
 */
export function useSwipeNavigation(currentView, onNavigate, containerRef) {
  const touchRef = useRef(null);

  const isInScrollableHorizontal = useCallback((el) => {
    let node = el;
    while (node && node !== containerRef?.current) {
      if (node.scrollWidth > node.clientWidth + 2) return true;
      if (node.dataset?.noSwipe === 'true') return true;
      node = node.parentElement;
    }
    return false;
  }, [containerRef]);

  const onTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;

    const tabIndex = TAB_VIEWS.indexOf(currentView);
    if (tabIndex === -1) return;

    if (isInScrollableHorizontal(e.target)) return;

    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      startTime: Date.now(),
      locked: false,
      cancelled: false,
    };
  }, [currentView, isInScrollableHorizontal]);

  const onTouchMove = useCallback((e) => {
    const t = touchRef.current;
    if (!t || t.cancelled) return;

    const dx = e.touches[0].clientX - t.startX;
    const dy = e.touches[0].clientY - t.startY;

    if (!t.locked) {
      const angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
      const isHorizontal = angle < ANGLE_MAX || angle > (180 - ANGLE_MAX);
      if (!isHorizontal) {
        t.cancelled = true;
        return;
      }
      t.locked = true;
    }
  }, []);

  const onTouchEnd = useCallback((e) => {
    const t = touchRef.current;
    touchRef.current = null;
    if (!t || t.cancelled || !t.locked) return;

    const dx = e.changedTouches[0].clientX - t.startX;
    const dt = (Date.now() - t.startTime) / 1000;
    const velocity = Math.abs(dx) / dt;

    if (Math.abs(dx) < SWIPE_THRESHOLD && velocity < VELOCITY_THRESHOLD) return;

    const tabIndex = TAB_VIEWS.indexOf(currentView);
    if (tabIndex === -1) return;

    if (dx > 0 && tabIndex > 0) {
      onNavigate(TAB_VIEWS[tabIndex - 1]);
    } else if (dx < 0 && tabIndex < TAB_VIEWS.length - 1) {
      onNavigate(TAB_VIEWS[tabIndex + 1]);
    }
  }, [currentView, onNavigate]);

  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [containerRef, onTouchStart, onTouchMove, onTouchEnd]);
}
