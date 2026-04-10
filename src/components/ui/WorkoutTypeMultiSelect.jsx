import { useMemo, useState } from 'react';
import { ChevronsUpDown, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover.jsx';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from './command.jsx';

/**
 * Multi-select com busca (cmdk + popover): só permite escolher valores do catálogo informado.
 */
export function WorkoutTypeMultiSelect({
  catalogOptions,
  value,
  onChange,
  disabled = false,
  id: fieldId = 'workout-type-multi',
  addButtonLabel = 'Adicionar tipo…'
}) {
  const [open, setOpen] = useState(false);

  const catalogSet = useMemo(() => new Set(catalogOptions), [catalogOptions]);
  const available = useMemo(
    () => catalogOptions.filter((t) => !value.includes(t)),
    [catalogOptions, value]
  );

  const add = (t) => {
    if (!catalogSet.has(t) || value.includes(t)) return;
    onChange([...value, t]);
    setOpen(false);
  };

  const remove = (t) => {
    onChange(value.filter((x) => x !== t));
  };

  return (
    <div className="space-y-2">
      <div
        id={fieldId}
        className="flex flex-wrap items-center gap-2 min-h-[44px] rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-2"
      >
        {value.length === 0 ? (
          <span className="text-xs text-zinc-600 px-1">Nenhum tipo isento — foto obrigatória para todos.</span>
        ) : null}
        {value.map((t) => {
          const unknown = !catalogSet.has(t);
          return (
            <span
              key={t}
              title={
                unknown
                  ? 'Valor salvo que não está no catálogo atual. Remova se não for mais necessário.'
                  : undefined
              }
              className={`inline-flex items-center gap-1 max-w-full rounded-lg border px-2 py-1 text-xs font-medium ${
                unknown
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                  : 'border-zinc-700 bg-zinc-800/80 text-zinc-200'
              }`}
            >
              <span className="truncate">{t}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(t)}
                className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-40"
                aria-label={`Remover ${t}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          );
        })}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled || available.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-zinc-600 px-2 py-1 text-xs font-bold uppercase text-green-400 hover:border-green-500/50 hover:bg-green-500/5 disabled:opacity-40 disabled:pointer-events-none"
            >
              {addButtonLabel}
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[min(100vw-2rem,22rem)]" align="start">
            <Command>
              <CommandInput placeholder="Buscar tipo de treino…" />
              <CommandList>
                <CommandEmpty>Nenhum tipo corresponde à busca.</CommandEmpty>
                <CommandGroup heading="Catálogo">
                  {available.map((t) => (
                    <CommandItem
                      key={t}
                      value={t}
                      keywords={[t]}
                      onSelect={() => add(t)}
                    >
                      <span className="truncate">{t}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {available.length === 0 && value.length > 0 && catalogOptions.length > 0 ? (
        <p className="text-[10px] text-zinc-600">Todos os tipos do catálogo já estão na lista de isentos.</p>
      ) : null}
    </div>
  );
}
