import { useState, useCallback, useEffect, useRef } from 'react';
import { VIEW_META, TAB_VIEWS, getTransitionDirection } from '../lib/view-transition.js';

const VIEW_TO_PATH = {
  home: '/',
  feed: '/feed',
  challenges: '/challenges',
  profile: '/profile',
  'edit-profile': '/profile/edit',
  'public-profile': '/user',
  friends: '/friends',
  'hashtag-feed': '/hashtag',
  notifications: '/notifications',
  'checkin-modal': '/checkin',
  'admin-tenants': '/admin/tenants',
  'admin-challenges': '/admin/challenges',
  'admin-moderation': '/admin/moderation',
  'admin-moderation-settings': '/admin/moderation-settings',
  'admin-users': '/admin/users',
  'admin-engagement': '/admin/engagement',
  'admin-audit': '/admin/audit',
  'admin-billing': '/admin/billing',
};

function pathToView(pathname) {
  if (pathname === '/' || pathname === '') return { view: 'home' };
  if (pathname === '/feed') return { view: 'feed' };
  if (pathname === '/challenges') return { view: 'challenges' };
  if (pathname === '/profile') return { view: 'profile' };
  if (pathname === '/profile/edit') return { view: 'edit-profile' };
  if (pathname === '/friends') return { view: 'friends' };
  if (pathname === '/notifications') return { view: 'notifications' };
  if (pathname === '/checkin') return { view: 'checkin-modal' };
  if (pathname.startsWith('/user/')) return { view: 'public-profile', param: pathname.slice(6) };
  if (pathname.startsWith('/hashtag/')) return { view: 'hashtag-feed', param: pathname.slice(9) };
  if (pathname.startsWith('/admin/')) {
    const sub = pathname.slice(7);
    const key = `admin-${sub}`;
    if (VIEW_META[key]) return { view: key };
  }
  return { view: 'home' };
}

function getViewPath(viewName, param) {
  const base = VIEW_TO_PATH[viewName] || '/';
  if (viewName === 'public-profile' && param) return `/user/${param}`;
  if (viewName === 'hashtag-feed' && param) return `/hashtag/${param}`;
  return base;
}

/**
 * Hook que gerencia a stack de navegação, integra com a History API do browser
 * e fornece funções navigate/goBack com cálculo automático de direção de transição.
 */
export function useNavigationStack() {
  const isPopRef = useRef(false);
  const stackRef = useRef(['home']);

  const initial = pathToView(window.location.pathname);
  const [view, setView] = useState(initial.view);
  const [transitionDir, setTransitionDir] = useState('none');
  const [routeParam, setRouteParam] = useState(initial.param ?? null);

  useEffect(() => {
    if (initial.view !== 'home') {
      stackRef.current = ['home', initial.view];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((newView, param) => {
    if (newView === view) return;

    const direction = getTransitionDirection(view, newView);
    setTransitionDir(direction);
    setView(newView);

    if (param !== undefined) setRouteParam(param);

    const meta = VIEW_META[newView];
    if (meta?.group === 'tab') {
      stackRef.current = [newView];
    } else {
      stackRef.current = [...stackRef.current, newView];
    }

    const path = getViewPath(newView, param);
    window.history.pushState({ view: newView, param }, '', path);
  }, [view]);

  const goBack = useCallback(() => {
    const stack = stackRef.current;
    if (stack.length <= 1) {
      if (view !== 'home') {
        navigate('home');
      }
      return;
    }

    stack.pop();
    const prevView = stack[stack.length - 1];

    setTransitionDir(getTransitionDirection(view, prevView));
    setView(prevView);

    if (!isPopRef.current) {
      window.history.back();
    }
  }, [view, navigate]);

  const canGoBack = view !== 'home' && !TAB_VIEWS.includes(view);

  useEffect(() => {
    const handler = (e) => {
      const state = e.state;
      if (state?.view) {
        isPopRef.current = true;
        const direction = getTransitionDirection(view, state.view);
        setTransitionDir(direction);
        setView(state.view);
        if (state.param !== undefined) setRouteParam(state.param);

        const meta = VIEW_META[state.view];
        if (meta?.group === 'tab') {
          stackRef.current = [state.view];
        } else {
          const idx = stackRef.current.lastIndexOf(state.view);
          if (idx >= 0) {
            stackRef.current = stackRef.current.slice(0, idx + 1);
          }
        }

        requestAnimationFrame(() => { isPopRef.current = false; });
      } else {
        isPopRef.current = true;
        setTransitionDir('back');
        setView('home');
        stackRef.current = ['home'];
        requestAnimationFrame(() => { isPopRef.current = false; });
      }
    };

    window.addEventListener('popstate', handler);

    if (!window.history.state?.view) {
      window.history.replaceState(
        { view: initial.view, param: initial.param },
        '',
        getViewPath(initial.view, initial.param)
      );
    }

    return () => window.removeEventListener('popstate', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  return { view, transitionDir, routeParam, navigate, goBack, canGoBack };
}
