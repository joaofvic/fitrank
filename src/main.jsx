import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initSentry } from './lib/sentry.js';
import { initPostHog } from './lib/posthog.js';
import App from './App.jsx';
import { AuthProvider } from './components/auth/AuthProvider.jsx';
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx';
import './styles/index.css';
import './lib/register-sw.js';

initSentry();
initPostHog();

import('./lib/web-vitals.js').then(({ initWebVitals }) => initWebVitals());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);

requestAnimationFrame(() => {
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 350);
  }
});
