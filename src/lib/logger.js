import { Sentry } from './sentry.js';

const IS_DEV = import.meta.env.DEV;

function addBreadcrumb(message, category, level) {
  if (Sentry?.addBreadcrumb) {
    Sentry.addBreadcrumb({ message, category, level });
  }
}

export const logger = {
  error(message, errorOrContext, context) {
    const err = errorOrContext instanceof Error ? errorOrContext : null;
    const ctx = err ? context : errorOrContext;

    if (IS_DEV) {
      console.error(`FitRank: ${message}`, err || '', ctx || '');
    }

    if (Sentry?.captureException && err) {
      Sentry.captureException(err, {
        extra: { message, ...ctx }
      });
    } else if (Sentry?.captureMessage) {
      Sentry.captureMessage(`FitRank: ${message}`, {
        level: 'error',
        extra: ctx
      });
    }
  },

  warn(message, context) {
    if (IS_DEV) {
      console.warn(`FitRank: ${message}`, context || '');
    }

    addBreadcrumb(message, 'warning', 'warning');

    if (Sentry?.captureMessage) {
      Sentry.captureMessage(`FitRank: ${message}`, {
        level: 'warning',
        extra: context
      });
    }
  },

  info(message, context) {
    if (IS_DEV) {
      console.log(`FitRank: ${message}`, context || '');
    }
    addBreadcrumb(message, 'info', 'info');
  }
};
