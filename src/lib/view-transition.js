/**
 * Mapa de metadata das views para calcular direção de transição automaticamente.
 * group: 'tab' = navegação principal, 'sub' = sub-tela, 'overlay' = modal/overlay, 'admin' = painel admin
 */
export const VIEW_META = {
  home:                     { index: 0, group: 'tab' },
  feed:                     { index: 1, group: 'tab' },
  challenges:               { index: 2, group: 'tab' },
  profile:                  { index: 3, group: 'tab' },
  'edit-profile':           { parent: 'profile', group: 'sub' },
  'public-profile':         { parent: 'feed', group: 'sub' },
  friends:                  { parent: 'home', group: 'sub' },
  'hashtag-feed':           { parent: 'feed', group: 'sub' },
  'checkin-modal':          { group: 'overlay' },
  notifications:            { group: 'overlay' },
  'admin-tenants':          { parent: 'profile', group: 'admin' },
  'admin-challenges':       { parent: 'profile', group: 'admin' },
  'admin-moderation':       { parent: 'profile', group: 'admin' },
  'admin-moderation-settings': { parent: 'profile', group: 'admin' },
  'admin-users':            { parent: 'profile', group: 'admin' },
  'admin-engagement':       { parent: 'profile', group: 'admin' },
  'admin-audit':            { parent: 'profile', group: 'admin' },
  'admin-billing':          { parent: 'profile', group: 'admin' },
};

export const TAB_VIEWS = ['home', 'feed', 'challenges', 'profile'];

/**
 * Calcula a direção de transição entre duas views.
 * @returns {'forward' | 'back' | 'up' | 'fade' | 'none'}
 */
export function getTransitionDirection(fromView, toView) {
  if (!fromView || fromView === toView) return 'none';

  const from = VIEW_META[fromView];
  const to = VIEW_META[toView];

  if (!from || !to) return 'fade';

  if (to.group === 'overlay') return 'up';
  if (from.group === 'overlay') return 'fade';

  if (from.group === 'tab' && to.group === 'tab') {
    return (to.index ?? 0) > (from.index ?? 0) ? 'forward' : 'back';
  }

  if (to.group === 'sub' || to.group === 'admin') return 'forward';
  if ((from.group === 'sub' || from.group === 'admin') && to.group === 'tab') return 'back';

  return 'fade';
}

/**
 * Executa a transição de view com a View Transitions API se disponível,
 * ou aplica classes CSS de fallback.
 */
export function navigateWithTransition(setView, newView, direction) {
  if (typeof document !== 'undefined' && document.startViewTransition) {
    document.startViewTransition(() => {
      setView(newView);
    });
  } else {
    setView(newView);
  }
  return direction;
}
