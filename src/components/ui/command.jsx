import { forwardRef } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';

export const Command = forwardRef(function Command({ className = '', ...props }, ref) {
  return (
    <CommandPrimitive
      ref={ref}
      className={`flex h-full w-full flex-col overflow-hidden rounded-lg bg-zinc-950 ${className}`}
      {...props}
    />
  );
});

export const CommandInput = forwardRef(function CommandInput({ className = '', ...props }, ref) {
  return (
    <div className="flex items-center border-b border-zinc-800 px-2" cmdk-input-wrapper="">
      <Search className="mr-2 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
      <CommandPrimitive.Input
        ref={ref}
        className={`flex h-10 w-full rounded-md bg-transparent py-2 text-sm text-white outline-none placeholder:text-zinc-500 ${className}`}
        {...props}
      />
    </div>
  );
});

export const CommandList = forwardRef(function CommandList({ className = '', ...props }, ref) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={`max-h-[280px] overflow-y-auto overflow-x-hidden p-1 ${className}`}
      {...props}
    />
  );
});

export function CommandEmpty({ className = '', ...props }) {
  return (
    <CommandPrimitive.Empty className={`py-6 text-center text-xs text-zinc-500 ${className}`} {...props} />
  );
}

export function CommandGroup({ className = '', ...props }) {
  return (
    <CommandPrimitive.Group
      className={`overflow-hidden p-1 text-zinc-100 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-zinc-500 ${className}`}
      {...props}
    />
  );
}

export const CommandItem = forwardRef(function CommandItem({ className = '', ...props }, ref) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={`relative flex cursor-pointer select-none items-center rounded-lg px-2 py-2 text-sm outline-none aria-selected:bg-zinc-800 aria-selected:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className}`}
      {...props}
    />
  );
});

export function CommandSeparator({ className = '', ...props }) {
  return <CommandPrimitive.Separator className={`-mx-1 h-px bg-zinc-800 ${className}`} {...props} />;
}
