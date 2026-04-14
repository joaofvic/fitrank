import { useCallback, useEffect, useState } from 'react';
import { TrendingDown, TrendingUp, Minus, ChevronRight, Ruler } from 'lucide-react';
import { Card } from './Card.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';

export function ProgressWidget({ userId, onOpenProgress }) {
  const { supabase } = useAuth();
  const [data, setData] = useState(null);
  const [thumbUrl, setThumbUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    try {
      const [measRes, photoRes] = await Promise.all([
        supabase.rpc('get_body_measurements_history', { p_user_id: userId, p_limit: 2 }),
        supabase.from('progress_photos')
          .select('photo_url')
          .eq('user_id', userId)
          .order('taken_at', { ascending: false })
          .limit(1),
      ]);
      if (measRes.error) throw measRes.error;
      setData(measRes.data || []);

      const latestPhoto = photoRes.data?.[0];
      if (latestPhoto?.photo_url) {
        const { data: urlData } = await supabase.storage
          .from('progress-photos')
          .createSignedUrl(latestPhoto.photo_url, 3600);
        if (urlData?.signedUrl) setThumbUrl(urlData.signedUrl);
      }
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="h-16 bg-zinc-900 rounded-2xl animate-pulse" />;
  }

  const latest = data?.[0];
  const previous = data?.[1];

  const hasMeasurement = latest?.weight_kg != null;
  const weight = hasMeasurement ? Number(latest.weight_kg) : null;
  const prevWeight = previous?.weight_kg != null ? Number(previous.weight_kg) : null;
  const diff = weight != null && prevWeight != null ? weight - prevWeight : null;

  const daysSince = latest?.measured_at
    ? Math.floor((Date.now() - new Date(latest.measured_at).getTime()) / 86400000)
    : null;

  return (
    <button
      type="button"
      onClick={onOpenProgress}
      className="w-full text-left"
    >
      <Card className="flex items-center justify-between hover:border-green-500/30 transition-colors group">
        <div className="flex items-center gap-3">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt="Progresso"
              className="w-10 h-10 rounded-xl object-cover ring-1 ring-zinc-700"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Ruler size={20} className="text-green-500" />
            </div>
          )}
          <div>
            {hasMeasurement ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black tabular-nums text-white">{weight.toFixed(1)} kg</span>
                  {diff != null && Math.abs(diff) >= 0.05 && (
                    <span className={`text-[11px] font-bold flex items-center gap-0.5 ${diff < 0 ? 'text-green-500' : 'text-red-400'}`}>
                      {diff < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)} kg
                    </span>
                  )}
                  {diff != null && Math.abs(diff) < 0.05 && (
                    <span className="text-[11px] font-bold text-zinc-500 flex items-center gap-0.5">
                      <Minus size={12} /> estável
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-zinc-500">
                  {daysSince === 0 ? 'Medido hoje' : daysSince === 1 ? 'Medido ontem' : `Há ${daysSince} dias`}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-zinc-300">Meu Progresso</p>
                <p className="text-[10px] text-zinc-500">Registre medidas e fotos</p>
              </>
            )}
          </div>
        </div>
        <ChevronRight size={18} className="text-zinc-600 group-hover:text-green-500 transition-colors" />
      </Card>
    </button>
  );
}
