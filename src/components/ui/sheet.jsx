import { forwardRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function Sheet({ ...props }) {
  return <DialogPrimitive.Root {...props} />;
}

export function SheetTrigger({ ...props }) {
  return <DialogPrimitive.Trigger {...props} />;
}

export function SheetPortal({ ...props }) {
  return <DialogPrimitive.Portal {...props} />;
}

export function SheetClose({ ...props }) {
  return <DialogPrimitive.Close {...props} />;
}

export const SheetOverlay = forwardRef(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in-fade ${className}`}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

const sideStyles = {
  bottom: 'inset-x-0 bottom-0 rounded-t-2xl border-t max-h-[85vh] animate-in-slide-up',
  top: 'inset-x-0 top-0 rounded-b-2xl border-b max-h-[85vh] animate-in-fade',
  right: 'inset-y-0 right-0 w-3/4 max-w-sm border-l h-full animate-in-fade',
  left: 'inset-y-0 left-0 w-3/4 max-w-sm border-r h-full animate-in-fade',
};

export const SheetContent = forwardRef(({ className = '', children, side = 'bottom', showClose = true, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={`fixed z-50 flex flex-col border-zinc-800 bg-zinc-900 shadow-xl ${sideStyles[side] ?? sideStyles.bottom} ${className}`}
      {...props}
    >
      {side === 'bottom' && (
        <div className="mx-auto mt-2 mb-0 h-1 w-10 shrink-0 rounded-full bg-zinc-700" />
      )}
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
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

export function SheetHeader({ className = '', ...props }) {
  return (
    <div className={`px-5 pt-3 pb-3 border-b border-zinc-800 shrink-0 ${className}`} {...props} />
  );
}

export const SheetTitle = forwardRef(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={`text-base font-bold text-white ${className}`}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

export const SheetDescription = forwardRef(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={`text-sm text-zinc-400 ${className}`}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';
