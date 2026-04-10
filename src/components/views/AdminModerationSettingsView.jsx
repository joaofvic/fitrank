import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { allocateCodeForNewRejectionReason } from '../../lib/rejection-reason-code.js';
import { CANONICAL_WORKOUT_TYPES } from '../../lib/workout-types.js';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { WorkoutTypeMultiSelect } from '../ui/WorkoutTypeMultiSelect.jsx';

/** Motivos que não podem ser desativados (sempre ativos no fluxo de moderação). */
const ALWAYS_ACTIVE_REASON_CODES = new Set(['other']);

function mergeTipoTreinoCatalog(rpcList, fallback) {
  const set = new Set();
  for (const x of fallback) {
    if (typeof x === 'string' && x.trim()) set.add(x.trim());
  }
  if (Array.isArray(rpcList)) {
    for (const x of rpcList) {
      if (typeof x === 'string' && x.trim()) set.add(x.trim());
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function AdminModerationSettingsView({ onBack }) {
  const { supabase, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const [autoFlagCount, setAutoFlagCount] = useState(5);
  const [autoFlagDays, setAutoFlagDays] = useState(7);
  const [catalogTipos, setCatalogTipos] = useState(() => [...CANONICAL_WORKOUT_TYPES]);
  const [exemptTipos, setExemptTipos] = useState([]);

  const [reasons, setReasons] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [newRequiresNote, setNewRequiresNote] = useState(false);

  const reasonsRef = useRef(reasons);
  const labelDebounceRef = useRef({});

  useEffect(() => {
    reasonsRef.current = reasons;
  }, [reasons]);

  useEffect(() => {
    const timers = labelDebounceRef.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = useCallback(async () => {
    if (!supabase || !profile?.is_platform_master) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: s, error: e1 }, { data: r, error: e2 }, { data: cat, error: e3 }] = await Promise.all([
        supabase.rpc('admin_moderation_settings_get'),
        supabase.rpc('admin_photo_rejection_reasons_list'),
        supabase.rpc('admin_tipo_treino_catalog')
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) {
        setCatalogTipos(mergeTipoTreinoCatalog(null, CANONICAL_WORKOUT_TYPES));
      } else {
        setCatalogTipos(mergeTipoTreinoCatalog(cat, CANONICAL_WORKOUT_TYPES));
      }
      const settingsRow = Array.isArray(s) ? s[0] : s;
      if (settingsRow) {
        setAutoFlagCount(settingsRow.auto_flag_rejection_count ?? 5);
        setAutoFlagDays(settingsRow.auto_flag_window_days ?? 7);
        const arr = Array.isArray(settingsRow.photo_exempt_tipo_treino)
          ? settingsRow.photo_exempt_tipo_treino.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
          : [];
        setExemptTipos(arr);
      }
      setReasons(Array.isArray(r) ? r : []);
    } catch (e) {
      setError(e?.message ?? 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [supabase, profile?.is_platform_master]);

  useEffect(() => {
    load();
  }, [load]);

  const persistRow = useCallback(
    async (row) => {
      if (!supabase || !profile?.is_platform_master || !row?.code) return;
      setSaving(true);
      setError(null);
      try {
        const codeKey = String(row.code).toLowerCase();
        const isActive = ALWAYS_ACTIVE_REASON_CODES.has(codeKey) ? true : Boolean(row.is_active);
        const { data, error: e } = await supabase.rpc('admin_photo_rejection_reasons_save', {
          p_code: row.code,
          p_label: row.label,
          p_requires_note: row.requires_note,
          p_is_active: isActive,
          p_sort_order: row.sort_order ?? 0
        });
        if (e) throw e;
        if (data && typeof data === 'object' && data.code) {
          setReasons((prev) => prev.map((r) => (r.code === row.code ? { ...r, ...data } : r)));
        }
      } catch (e) {
        setError(e?.message ?? 'Falha ao salvar motivo');
        await load();
      } finally {
        setSaving(false);
      }
    },
    [supabase, profile?.is_platform_master, load]
  );

  const scheduleLabelPersist = useCallback(
    (code) => {
      const timers = labelDebounceRef.current;
      if (timers[code]) clearTimeout(timers[code]);
      timers[code] = setTimeout(() => {
        delete timers[code];
        const row = reasonsRef.current.find((r) => r.code === code);
        if (row) void persistRow(row);
      }, 700);
    },
    [persistRow]
  );

  const updateLabel = useCallback(
    (code, label) => {
      setReasons((prev) => prev.map((r) => (r.code === code ? { ...r, label } : r)));
      scheduleLabelPersist(code);
    },
    [scheduleLabelPersist]
  );

  const updateCheckboxAndPersist = useCallback(
    (code, patch) => {
      if (ALWAYS_ACTIVE_REASON_CODES.has(String(code).toLowerCase()) && patch.is_active === false) {
        return;
      }
      setReasons((prev) => {
        const next = prev.map((r) => (r.code === code ? { ...r, ...patch } : r));
        const updated = next.find((r) => r.code === code);
        if (updated) queueMicrotask(() => void persistRow(updated));
        return next;
      });
    },
    [persistRow]
  );

  const handleDragEnd = useCallback(
    async (event) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !supabase || !profile?.is_platform_master) return;

      const prev = reasonsRef.current;
      const oldIndex = prev.findIndex((r) => r.code === active.id);
      const newIndex = prev.findIndex((r) => r.code === over.id);
      if (oldIndex < 0 || newIndex < 0) return;

      const next = arrayMove(prev, oldIndex, newIndex).map((r, i) => ({ ...r, sort_order: i }));
      setReasons(next);

      setSaving(true);
      setError(null);
      try {
        const { error: e } = await supabase.rpc('admin_photo_rejection_reasons_reorder', {
          p_codes: next.map((r) => r.code)
        });
        if (e) throw e;
        setOk('Ordem dos motivos atualizada.');
        setTimeout(() => setOk(null), 2500);
      } catch (e) {
        setError(e?.message ?? 'Falha ao salvar ordem');
        await load();
      } finally {
        setSaving(false);
      }
    },
    [supabase, profile?.is_platform_master, load]
  );

  const savePolicies = async () => {
    if (!supabase || !profile?.is_platform_master) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const { error: e } = await supabase.rpc('admin_moderation_settings_save', {
        p_auto_flag_rejection_count: Number(autoFlagCount),
        p_auto_flag_window_days: Number(autoFlagDays),
        p_photo_exempt_tipo_treino: exemptTipos
      });
      if (e) throw e;
      setOk('Políticas salvas.');
    } catch (e) {
      setError(e?.message ?? 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const deleteReason = async (code) => {
    const key = String(code).toLowerCase();
    if (ALWAYS_ACTIVE_REASON_CODES.has(key)) return;
    const row = reasonsRef.current.find((r) => r.code === code);
    const label = row?.label?.trim() || 'este motivo';
    if (
      !window.confirm(
        `Remover «${label}» do catálogo?\n\nSó é possível se nenhum check-in tiver sido rejeitado com este motivo. Caso contrário, desative em «Ativo».`
      )
    ) {
      return;
    }
    if (!supabase || !profile?.is_platform_master) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const { error: e } = await supabase.rpc('admin_photo_rejection_reasons_delete', { p_code: code });
      if (e) throw e;
      setOk('Motivo removido.');
      await load();
    } catch (e) {
      setError(e?.message ?? 'Falha ao remover motivo');
    } finally {
      setSaving(false);
    }
  };

  const addReason = async () => {
    const label = newLabel.trim();
    if (!label) {
      setError('Informe o nome do motivo (o texto que o usuário vê ao rejeitar).');
      return;
    }
    const existing = reasonsRef.current.map((r) => r.code);
    const code = allocateCodeForNewRejectionReason(label, existing);
    if (!code) {
      setError('Não foi possível gerar o identificador interno. Tente outro nome.');
      return;
    }
    if (!supabase || !profile?.is_platform_master) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const sortOrder = reasonsRef.current.length;
      const { error: e } = await supabase.rpc('admin_photo_rejection_reasons_save', {
        p_code: code,
        p_label: label,
        p_requires_note: newRequiresNote,
        p_is_active: true,
        p_sort_order: sortOrder
      });
      if (e) throw e;
      setNewLabel('');
      setNewRequiresNote(false);
      setOk('Motivo adicionado.');
      await load();
    } catch (e) {
      setError(e?.message ?? 'Falha ao adicionar motivo');
    } finally {
      setSaving(false);
    }
  };

  if (!profile?.is_platform_master) {
    return null;
  }

  const sortableIds = reasons.map((r) => r.code);

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-black uppercase tracking-tight text-white">Admin · Config moderação</h2>
        <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-green-400">
          Voltar
        </button>
      </div>

      <p className="text-xs text-zinc-500">
        US-ADM-16: motivos de rejeição (catálogo) e políticas (auto-flag por volume de rejeições, exceção de foto por tipo
        de treino).
      </p>

      {loading ? <p className="text-zinc-500 text-sm">Carregando…</p> : null}
      {error ? (
        <p className="text-red-400 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="text-green-400 text-sm" role="status">
          {ok}
        </p>
      ) : null}

      <Card className="space-y-4">
        <h3 className="text-sm font-black uppercase text-zinc-400">Políticas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-black text-zinc-500">Auto-flag (rejeições)</label>
            <input
              type="number"
              min={1}
              max={500}
              value={autoFlagCount}
              onChange={(e) => setAutoFlagCount(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            />
            <span className="text-[10px] text-zinc-600">Marcar perfil quando o usuário atingir X rejeições…</span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-black text-zinc-500">…em Y dias</label>
            <input
              type="number"
              min={1}
              max={365}
              value={autoFlagDays}
              onChange={(e) => setAutoFlagDays(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            />
            <span className="text-[10px] text-zinc-600">Com base na data da decisão de moderação.</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="photo-exempt-tipo-treino"
            className="text-[10px] uppercase font-black text-zinc-500"
          >
            Tipos de treino sem foto
          </label>
          <WorkoutTypeMultiSelect
            id="photo-exempt-tipo-treino"
            catalogOptions={catalogTipos}
            value={exemptTipos}
            onChange={setExemptTipos}
            disabled={saving}
            addButtonLabel="Adicionar tipo…"
          />
          <p className="text-[10px] text-zinc-600">
            Catálogo = presets do app + tipos já usados em check-ins. Só é possível adicionar entradas da lista (sem
            digitação livre). Lista vazia = todos exigem foto. Valores antigos fora do catálogo aparecem em destaque até
            você removê-los.
          </p>
        </div>
        <Button type="button" variant="secondary" className="text-xs py-2" onClick={savePolicies} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar políticas'}
        </Button>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-black uppercase text-zinc-400">Motivos de rejeição</h3>
          <p className="text-[10px] text-zinc-500">
            Arraste pelo ícone à esquerda para reordenar. Rótulo e opções são salvos automaticamente (rótulo após pausa na
            digitação). Remover só é permitido se nenhum check-in usar o motivo; «Outro» não pode ser excluído.
          </p>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <ul className="space-y-3 list-none p-0 m-0" role="list">
              {reasons.map((row) => (
                <SortableReasonRow
                  key={row.code}
                  id={row.code}
                  row={row}
                  disabled={saving}
                  lockActiveToggle={ALWAYS_ACTIVE_REASON_CODES.has(String(row.code).toLowerCase())}
                  canDelete={!ALWAYS_ACTIVE_REASON_CODES.has(String(row.code).toLowerCase())}
                  onLabelChange={updateLabel}
                  onCheckboxChange={updateCheckboxAndPersist}
                  onDelete={deleteReason}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <div className="border-t border-zinc-800 pt-4 space-y-2">
          <p className="text-[10px] uppercase font-black text-zinc-500">Novo motivo</p>
          <label htmlFor="new-rejection-reason-label" className="flex flex-col gap-1">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Nome (visto pelo usuário)</span>
            <input
              id="new-rejection-reason-label"
              placeholder="Ex.: Foto embaçada"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white"
            />
          </label>
          <div className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={newRequiresNote}
                onChange={(e) => setNewRequiresNote(e.target.checked)}
              />
              Exige observação
            </label>
            <Button type="button" variant="secondary" className="text-xs py-2" onClick={addReason} disabled={saving}>
              Adicionar
            </Button>
          </div>
          <p className="text-[10px] text-zinc-600">
            O sistema gera sozinho o código interno (slug) a partir do nome. Novos itens entram ao fim; use o arrastar para
            posicionar.
          </p>
        </div>
      </Card>
    </div>
  );
}

function SortableReasonRow({
  id,
  row,
  disabled,
  lockActiveToggle,
  canDelete,
  onLabelChange,
  onCheckboxChange,
  onDelete
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <li ref={setNodeRef} style={style} className={`${isDragging ? 'z-10' : ''}`}>
      <div
        className={`rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 space-y-2 ${
          isDragging ? 'opacity-80 ring-1 ring-green-500/40 shadow-lg' : ''
        }`}
      >
        <div className="flex flex-wrap items-start gap-2">
          <button
            type="button"
            className="mt-0.5 shrink-0 touch-none rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-40"
            disabled={disabled}
            aria-label={`Arrastar motivo: ${row.label || row.code}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 space-y-2">
            <input
              value={row.label ?? ''}
              onChange={(e) => onLabelChange(row.code, e.target.value)}
              disabled={disabled}
              className="w-full bg-black/40 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(row.requires_note)}
                    disabled={disabled}
                    onChange={(e) => onCheckboxChange(row.code, { requires_note: e.target.checked })}
                  />
                  Exige observação
                </label>
                <label
                  className={`flex items-center gap-2 ${lockActiveToggle ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                  title={
                    lockActiveToggle
                      ? 'Motivo de sistema: «Outro» precisa ficar ativo para classificar casos fora do padrão.'
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={Boolean(row.is_active)}
                    disabled={disabled || lockActiveToggle}
                    onChange={(e) => onCheckboxChange(row.code, { is_active: e.target.checked })}
                  />
                  Ativo
                  {lockActiveToggle ? (
                    <span className="text-[10px] uppercase text-zinc-600 font-bold">obrigatório</span>
                  ) : null}
                </label>
              </div>
              {canDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  className="text-[10px] py-1 px-2 h-auto border-red-900/50 text-red-400 hover:bg-red-950/40 hover:text-red-300"
                  disabled={disabled}
                  onClick={() => onDelete(row.code)}
                >
                  Remover
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
