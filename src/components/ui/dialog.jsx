import { forwardRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function Dialog({ ...props }) {
  return <DialogPrimitive.Root {...props} />;
}

export function DialogTrigger({ ...props }) {
  return <DialogPrimitive.Trigger {...props} />;
}

export function DialogPortal({ ...props }) {
  return <DialogPrimitive.Portal {...props} />;
}

export function DialogClose({ ...props }) {
  return <DialogPrimitive.Close {...props} />;
}

export const DialogOverlay = forwardRef(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={`fixed inset-0 z-50 bg-black/55 backdrop-blur-md backdrop-saturate-150 animate-in-fade ${className}`}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

export const DialogContent = forwardRef(({
  className = '',
  children,
  showClose = true,
  /**
   * `centered` — modal clássico.
   * `fullscreen` — cobre a tela (stories, crop); fundo opaco via `className` (ex.: bg-black).
   * `fullscreenFloating` — viewport rolável, shell transparente: vê-se blur + UI atrás; card filho traz o painel.
   */
  variant = 'centered',
  ...props
}, ref) => {
  const centeredClasses =
    'fixed left-1/2 top-1/2 z-[51] w-[calc(100%-2rem)] max-w-lg max-h-[min(100dvh-2rem,920px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-xl animate-in-fade';
  const fullscreenClasses =
    'fixed inset-0 z-[51] min-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-none border-0 p-0 shadow-none animate-in-fade';
  const fullscreenFloatingClasses =
    'fixed inset-0 z-[51] flex min-h-[100dvh] w-full flex-col items-center overflow-y-auto overflow-x-hidden overscroll-y-contain bg-transparent px-3 py-4 sm:px-4 sm:py-6 animate-in-fade';
  const layoutClass =
    variant === 'fullscreenFloating'
      ? fullscreenFloatingClasses
      : variant === 'fullscreen'
        ? fullscreenClasses
        : centeredClasses;

  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={`${layoutClass} ${className}`.trim()}
      {...props}
    >
      {children}
      {showClose && (
        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded-full p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/50"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
  );
});
DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className = '', ...props }) {
  return (
    <div className={`flex flex-col gap-1.5 text-left ${className}`} {...props} />
  );
}

export function DialogFooter({ className = '', ...props }) {
  return (
    <div className={`flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end ${className}`} {...props} />
  );
}

export const DialogTitle = forwardRef(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={`text-lg font-bold text-white ${className}`}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = forwardRef(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={`text-sm text-zinc-400 ${className}`}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';
