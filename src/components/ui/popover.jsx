import * as PopoverPrimitive from '@radix-ui/react-popover';

export function Popover({ ...props }) {
  return <PopoverPrimitive.Root {...props} />;
}

export function PopoverTrigger({ ...props }) {
  return <PopoverPrimitive.Trigger {...props} />;
}

export function PopoverContent({ className = '', align = 'start', sideOffset = 4, ...props }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={`z-[100] max-h-[min(360px,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-[min(100vw-2rem,22rem)] rounded-xl border border-zinc-800 bg-zinc-950 p-0 text-zinc-100 shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 ${className}`}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
