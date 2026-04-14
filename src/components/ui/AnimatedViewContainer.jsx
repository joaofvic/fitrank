import { useRef, useState, useEffect } from 'react';

const ANIMATION_DURATION = 280;

const ENTER_CLASS = {
  forward: 'view-enter-forward',
  back:    'view-enter-back',
  up:      'view-enter-up',
  fade:    'view-enter-fade',
  none:    'view-enter-none',
};

/**
 * Wraps o conteúdo principal e aplica animação CSS de transição
 * quando `currentView` muda. A direção controla a animação de entrada.
 */
export function AnimatedViewContainer({ currentView, direction, children }) {
  const containerRef = useRef(null);
  const [animClass, setAnimClass] = useState('');
  const prevViewRef = useRef(currentView);

  useEffect(() => {
    if (prevViewRef.current === currentView) return;
    prevViewRef.current = currentView;

    const dir = direction || 'fade';
    const enterCls = ENTER_CLASS[dir] || ENTER_CLASS.fade;

    setAnimClass(enterCls);

    const el = containerRef.current;
    if (el) {
      el.scrollTop = 0;
    }

    const timer = setTimeout(() => setAnimClass(''), ANIMATION_DURATION + 20);
    return () => clearTimeout(timer);
  }, [currentView, direction]);

  return (
    <div
      ref={containerRef}
      className={`view-swipe-container ${animClass}`}
      style={{ minHeight: '100%' }}
    >
      {children}
    </div>
  );
}
