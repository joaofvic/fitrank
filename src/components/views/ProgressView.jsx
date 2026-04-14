import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Plus, Ruler, Camera, TrendingDown, TrendingUp,
  Trash2, Loader2, X
} from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { PhotoCompareSlider } from '../ui/PhotoCompareSlider.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { logger } from '../../lib/logger.js';

const MEASUREMENT_FIELDS = [
  { key: 'weight_kg', label: 'Peso', unit: 'kg', step: '0.1' },
  { key: 'body_fat_pct', label: 'Gordura', unit: '%', step: '0.1' },
  { key: 'chest_cm', label: 'Peitoral', unit: 'cm', step: '0.1' },
  { key: 'waist_cm', label: 'Cintura', unit: 'cm', step: '0.1' },
  { key: 'hip_cm', label: 'Quadril', unit: 'cm', step: '0.1' },
  { key: 'bicep_cm', label: 'Bíceps', unit: 'cm', step: '0.1' },
  { key: 'thigh_cm', label: 'Coxa', unit: 'cm', step: '0.1' },
  { key: 'calf_cm', label: 'Panturrilha', unit: 'cm', step: '0.1' },
];

const PHOTO_TYPES = [
  { id: 'front', label: 'Frente' },
  { id: 'side', label: 'Lado' },
  { id: 'back', label: 'Costas' },
];

function formatDate(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function delta(current, previous, unit) {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.01) return null;
  const sign = diff > 0 ? '+' : '';
  const color = unit === 'kg' || unit === '%'
    ? (diff < 0 ? 'text-green-500' : 'text-red-400')
    : (diff < 0 ? 'text-green-500' : 'text-red-400');
  return { text: `${sign}${diff.toFixed(1)} ${unit}`, color, diff };
}

function Sparkline({ data, width = 120, height = 32 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const trending = data[data.length - 1] <= data[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={trending ? 'rgb(34 197 94)' : 'rgb(248 113 113)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MeasurementsTab({ supabase, userId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const loadRecords = useCallback(async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_body_measurements_history', {
        p_user_id: userId,
        p_limit: 50,
      });
      if (error) throw error;
      setRecords(data || []);
    } catch (e) {
      logger.error('load measurements', e);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleSave = async () => {
    const filled = MEASUREMENT_FIELDS.some(({ key }) => form[key] && Number(form[key]) > 0);
    if (!filled) return;
    setSaving(true);
    try {
      const row = { user_id: userId, measured_at: new Date().toISOString().split('T')[0] };
      for (const { key } of MEASUREMENT_FIELDS) {
        const v = parseFloat(form[key]);
        if (Number.isFinite(v) && v > 0) row[key] = v;
      }
      if (form.notes?.trim()) row.notes = form.notes.trim();
      const { error } = await supabase.from('body_measurements').insert(row);
      if (error) throw error;
      setForm({});
      setFormOpen(false);
      await loadRecords();
    } catch (e) {
      logger.error('save measurement', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await supabase.from('body_measurements').delete().eq('id', id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      logger.error('delete measurement', e);
    }
  };

  const weightSeries = useMemo(() => {
    return records
      .filter((r) => r.weight_kg != null)
      .slice(0, 30)
      .reverse()
      .map((r) => Number(r.weight_kg));
  }, [records]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-zinc-900 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {weightSeries.length >= 2 && (
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 font-bold uppercase">Peso (tendência)</p>
            <p className="text-lg font-black tabular-nums">
              {weightSeries[weightSeries.length - 1].toFixed(1)} kg
            </p>
          </div>
          <Sparkline data={weightSeries} />
        </Card>
      )}

      {!formOpen ? (
        <Button onClick={() => setFormOpen(true)} className="w-full">
          <Plus size={18} />
          Registrar medidas
        </Button>
      ) : (
        <Card className="space-y-3 border-green-500/20">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white">Novo registro</h4>
            <button type="button" onClick={() => setFormOpen(false)} className="text-zinc-500 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {MEASUREMENT_FIELDS.map(({ key, label, unit, step }) => (
              <div key={key} className="space-y-1">
                <label className="text-[10px] text-zinc-500 uppercase font-bold">{label} ({unit})</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step={step}
                  min="0"
                  placeholder="—"
                  value={form[key] || ''}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:border-green-500/50"
                />
              </div>
            ))}
          </div>
          <textarea
            placeholder="Notas (opcional)"
            value={form.notes || ''}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:border-green-500/50 resize-none"
          />
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Salvar'}
          </Button>
        </Card>
      )}

      {records.length === 0 && !formOpen && (
        <div className="text-center py-10 border-2 border-dashed border-zinc-800 rounded-2xl">
          <Ruler className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-600">Nenhuma medida registrada</p>
        </div>
      )}

      <div className="space-y-2">
        {records.map((r, idx) => {
          const prev = records[idx + 1];
          return (
            <Card key={r.id} className="relative group">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-zinc-500 font-semibold">{formatDate(r.measured_at)}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {MEASUREMENT_FIELDS.map(({ key, label, unit }) => {
                      const v = r[key];
                      if (v == null) return null;
                      const d = delta(Number(v), prev?.[key] != null ? Number(prev[key]) : null, unit);
                      return (
                        <span key={key} className="text-xs text-zinc-300">
                          <span className="text-zinc-500">{label}:</span>{' '}
                          <span className="font-bold tabular-nums">{Number(v).toFixed(1)}</span>
                          <span className="text-zinc-600">{unit}</span>
                          {d && <span className={`ml-1 text-[10px] font-bold ${d.color}`}>{d.text}</span>}
                        </span>
                      );
                    })}
                  </div>
                  {r.notes && <p className="text-[11px] text-zinc-600 mt-1 italic">{r.notes}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(r.id)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all p-1"
                  aria-label="Excluir registro"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PhotosTab({ supabase, userId }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [photoType, setPhotoType] = useState('front');
  const [photoDate, setPhotoDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const fileRef = useRef(null);

  const loadPhotos = useCallback(async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_progress_photos', { p_user_id: userId });
      if (error) throw error;
      const rows = data || [];
      for (const p of rows) {
        if (p.photo_url && !p.photo_url.startsWith('http')) {
          const { data: urlData } = await supabase.storage
            .from('progress-photos')
            .createSignedUrl(p.photo_url, 3600);
          if (urlData?.signedUrl) p.signed_url = urlData.signedUrl;
        }
      }
      setPhotos(rows);
    } catch (e) {
      logger.error('load progress photos', e);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('progress-photos')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('progress_photos').insert({
        user_id: userId,
        photo_url: path,
        photo_type: photoType,
        taken_at: photoDate || new Date().toISOString().split('T')[0],
      });
      if (insErr) throw insErr;
      await loadPhotos();
    } catch (e) {
      logger.error('upload progress photo', e);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (photo) => {
    try {
      if (photo.photo_url) {
        await supabase.storage.from('progress-photos').remove([photo.photo_url]);
      }
      await supabase.from('progress_photos').delete().eq('id', photo.id);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (e) {
      logger.error('delete progress photo', e);
    }
  };

  const toggleSelect = (photo) => {
    setSelectedPhotos((prev) => {
      const exists = prev.find((p) => p.id === photo.id);
      if (exists) return prev.filter((p) => p.id !== photo.id);
      if (prev.length >= 2) return [prev[1], photo];
      return [...prev, photo];
    });
  };

  const grouped = useMemo(() => {
    const map = {};
    for (const p of photos) {
      const key = p.taken_at;
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [photos]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="aspect-square bg-zinc-900 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const canCompare = photos.length >= 2;
  const comparePhotos = selectedPhotos.length === 2;
  const leftPhoto = comparePhotos ? (selectedPhotos[0].signed_url || selectedPhotos[0].photo_url) : null;
  const rightPhoto = comparePhotos ? (selectedPhotos[1].signed_url || selectedPhotos[1].photo_url) : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <div className="flex gap-1 flex-1 min-w-0">
          {PHOTO_TYPES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPhotoType(id)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-colors ${
                photoType === id
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={photoDate}
          max={new Date().toISOString().split('T')[0]}
          onChange={(e) => setPhotoDate(e.target.value)}
          className="h-9 px-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-green-500/50 [color-scheme:dark]"
        />
        <label className="cursor-pointer">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
          <div className="h-9 px-3 rounded-lg bg-green-500 text-black font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-transform">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            Foto
          </div>
        </label>
      </div>

      {canCompare && (
        <button
          type="button"
          onClick={() => { setCompareMode((p) => !p); setSelectedPhotos([]); }}
          className={`w-full py-2 rounded-xl text-xs font-bold uppercase transition-colors ${
            compareMode
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
              : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:border-zinc-600'
          }`}
        >
          <ArrowLeftRight size={14} className="inline mr-1.5" />
          {compareMode ? 'Cancelar comparação' : 'Comparar antes/depois'}
        </button>
      )}

      {compareMode && (
        <p className="text-[11px] text-zinc-500 text-center">
          {selectedPhotos.length === 0
            ? 'Selecione 2 fotos para comparar'
            : selectedPhotos.length === 1
              ? 'Selecione mais 1 foto'
              : 'Arraste o slider para comparar'}
        </p>
      )}

      {comparePhotos && leftPhoto && rightPhoto && (
        <PhotoCompareSlider left={leftPhoto} right={rightPhoto} />
      )}

      {photos.length === 0 && (
        <div className="text-center py-10 border-2 border-dashed border-zinc-800 rounded-2xl">
          <Camera className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-600">Nenhuma foto de evolução</p>
          <p className="text-xs text-zinc-700 mt-1">Registre seu progresso visual</p>
        </div>
      )}

      {grouped.map(([date, items]) => (
        <div key={date}>
          <p className="text-[10px] text-zinc-500 font-bold uppercase mb-2">{formatDate(date)}</p>
          <div className="grid grid-cols-3 gap-2">
            {items.map((p) => {
              const url = p.signed_url || p.photo_url;
              const isSelected = selectedPhotos.some((s) => s.id === p.id);
              return (
                <div key={p.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => compareMode && toggleSelect(p)}
                    className={`aspect-square w-full overflow-hidden rounded-xl border-2 transition-colors ${
                      isSelected ? 'border-purple-500' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={url}
                      alt={`Foto ${p.photo_type}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 rounded text-[9px] font-bold text-white uppercase">
                    {p.photo_type}
                  </span>
                  {!compareMode && (
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-zinc-400 hover:text-red-400 transition-all"
                      aria-label="Excluir foto"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProgressView({ onBack }) {
  const { supabase, session } = useAuth();
  const userId = session?.user?.id;
  const [tab, setTab] = useState('measurements');

  return (
    <div className="space-y-5 animate-in-fade">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors">
          <ChevronLeft size={20} />
          <span className="text-sm font-semibold">Voltar</span>
        </button>
        <h2 className="text-lg font-black uppercase tracking-tight">Meu Progresso</h2>
        <div className="w-16" />
      </div>

      <div className="flex rounded-xl bg-zinc-900/80 border border-zinc-800 p-1 gap-1">
        <button
          type="button"
          onClick={() => setTab('measurements')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-1.5 ${
            tab === 'measurements'
              ? 'bg-green-500/20 text-green-400 border border-green-500/40'
              : 'text-zinc-500 border border-transparent hover:text-zinc-300'
          }`}
        >
          <Ruler size={14} />
          Medidas
        </button>
        <button
          type="button"
          onClick={() => setTab('photos')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-1.5 ${
            tab === 'photos'
              ? 'bg-green-500/20 text-green-400 border border-green-500/40'
              : 'text-zinc-500 border border-transparent hover:text-zinc-300'
          }`}
        >
          <Camera size={14} />
          Fotos
        </button>
      </div>

      {tab === 'measurements' && <MeasurementsTab supabase={supabase} userId={userId} />}
      {tab === 'photos' && <PhotosTab supabase={supabase} userId={userId} />}
    </div>
  );
}
