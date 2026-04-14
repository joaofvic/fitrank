const SENTRY_DSN = Deno.env.get('SENTRY_DSN') || '';

interface LogContext {
  function_name: string;
  user_id?: string;
  [key: string]: unknown;
}

function parseSentryDsn(dsn: string) {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace('/', '');
    const host = url.hostname;
    return { publicKey, projectId, host };
  } catch {
    return null;
  }
}

async function sendToSentry(
  level: 'error' | 'warning' | 'info',
  message: string,
  context: LogContext,
  error?: Error
) {
  const parsed = parseSentryDsn(SENTRY_DSN);
  if (!parsed) return;

  const { publicKey, projectId, host } = parsed;
  const envelopeUrl = `https://${host}/api/${projectId}/envelope/`;

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const timestamp = Date.now() / 1000;

  const event: Record<string, unknown> = {
    event_id: eventId,
    timestamp,
    platform: 'node',
    level,
    server_name: 'supabase-edge',
    environment: Deno.env.get('ENVIRONMENT') || 'production',
    tags: {
      function_name: context.function_name,
      runtime: 'deno'
    },
    extra: context,
    message: { formatted: message }
  };

  if (error) {
    event.exception = {
      values: [
        {
          type: error.name || 'Error',
          value: error.message,
          stacktrace: error.stack
            ? {
                frames: error.stack
                  .split('\n')
                  .slice(1)
                  .map((line: string) => ({ filename: line.trim() }))
              }
            : undefined
        }
      ]
    };
  }

  const envelope = [
    JSON.stringify({
      event_id: eventId,
      sent_at: new Date().toISOString(),
      dsn: SENTRY_DSN
    }),
    JSON.stringify({ type: 'event', content_type: 'application/json' }),
    JSON.stringify(event)
  ].join('\n');

  try {
    await fetch(envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}`
      },
      body: envelope
    });
  } catch {
    // Best-effort: don't crash the function if Sentry is unreachable
  }
}

function formatLog(
  level: string,
  message: string,
  context: LogContext
): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    function_name: context.function_name,
    message,
    ...context
  });
}

export const edgeLogger = {
  error(message: string, context: LogContext, error?: Error) {
    console.error(formatLog('error', message, context));
    sendToSentry('error', message, context, error);
  },

  warn(message: string, context: LogContext) {
    console.warn(formatLog('warning', message, context));
    sendToSentry('warning', message, context);
  },

  info(message: string, context: LogContext) {
    console.log(formatLog('info', message, context));
  }
};
