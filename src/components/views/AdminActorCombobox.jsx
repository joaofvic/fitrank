import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.jsx';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '../ui/command.jsx';
/**
 * Combobox estilo Shadcn: busca admins (platform master) por nome/e-mail e guarda o UUID em background.
 */
export function AdminActorCombobox({
  supabase,
  actorId,
  actorLabel,
  onChange,
  disabled = false,
  id: inputId = 'admin-actor-combobox'
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadMasters = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase.rpc('admin_platform_masters_search', {
        p_q: debouncedSearch ?? ''
      });
      if (error) {
        setMasters([]);
        setFetchError(error.message ?? 'Falha ao buscar admins');
        return;
      }
      setMasters(Array.isArray(data) ? data : []);
    } catch (e) {
      setMasters([]);
      setFetchError(e?.message ?? 'Falha ao buscar admins');
    } finally {
      setLoading(false);
    }
  }, [supabase, debouncedSearch]);

  useEffect(() => {
    if (!open || !supabase) return;
    loadMasters();
  }, [open, supabase, loadMasters]);

  const handleClear = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange({ id: null, label: '' });
    setSearch('');
  };

  const displayLabel = actorLabel?.trim() || 'Todos os admins';

  return (
    <div className="flex flex-col gap-1 sm:col-span-2">
      <label htmlFor={inputId} className="text-[10px] uppercase font-black text-zinc-500">
        Admin (E-mail ou Nome)
      </label>
      <div className="flex gap-2 items-start">
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) setSearch('');
          }}
        >
          <PopoverTrigger asChild>
            <button
              id={inputId}
              type="button"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className="flex flex-1 min-w-0 items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-sm text-white hover:bg-zinc-900/80 disabled:opacity-50 disabled:pointer-events-none"
            >
              <span className={`truncate ${!actorLabel ? 'text-zinc-500' : ''}`}>{displayLabel}</span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Digite nome ou e-mail…"
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandGroup heading="Filtro">
                  <CommandItem
                    value="__all__"
                    onSelect={() => {
                      onChange({ id: null, label: '' });
                      setSearch('');
                      setOpen(false);
                    }}
                  >
                    <span className="text-zinc-400">Todos os admins</span>
                  </CommandItem>
                </CommandGroup>
                {loading ? (
                  <div className="py-4 text-center text-xs text-zinc-500">Buscando…</div>
                ) : fetchError ? (
                  <div className="py-4 px-2 text-center text-xs text-red-400">{fetchError}</div>
                ) : masters.length === 0 ? (
                  <CommandEmpty>Nenhum admin encontrado para esta busca.</CommandEmpty>
                ) : (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Platform masters">
                      {masters.map((m) => (
                        <CommandItem
                          key={m.id}
                          value={`${m.label} ${m.id}`}
                          onSelect={() => {
                            onChange({ id: m.id, label: m.label });
                            setSearch('');
                            setOpen(false);
                          }}
                        >
                          <span className="truncate">{m.label}</span>
                          {actorId === m.id ? (
                            <Check className="ml-auto h-4 w-4 shrink-0 text-green-400" aria-hidden />
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {actorId ? (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="mt-0 shrink-0 rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-50"
            aria-label="Limpar filtro de admin"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
