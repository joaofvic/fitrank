import { Sentry } from '../../lib/sentry.js';
import { AlertTriangle, RefreshCw } from 'lucide-react';

function FallbackUI({ resetError }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground">Algo deu errado</h2>
        <p className="text-sm text-muted-foreground">
          Um erro inesperado ocorreu. Tente recarregar o aplicativo.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <RefreshCw className="h-4 w-4" />
          Recarregar
        </button>
        {resetError && (
          <button
            onClick={resetError}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
          >
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}

export function ErrorBoundary({ children }) {
  if (!Sentry?.ErrorBoundary) {
    return children;
  }

  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => <FallbackUI resetError={resetError} />}
      showDialog={false}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
