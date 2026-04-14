import { track } from './analytics.js';

export function initWebVitals() {
  import('web-vitals').then(({ onCLS, onINP, onLCP, onTTFB }) => {
    const send = ({ name, value, rating }) => {
      track('web_vitals', {
        metric: name,
        value: Math.round(name === 'CLS' ? value * 1000 : value),
        rating
      });
    };

    onCLS(send);
    onINP(send);
    onLCP(send);
    onTTFB(send);
  });
}
