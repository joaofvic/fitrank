export function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayLocalISODate() {
  return toLocalISODate(new Date());
}

export function firstOfMonthLocalISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** Segunda-feira (ISO) da semana local que contém `ref`. */
export function startOfWeekMondayLocalISODate(ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toLocalISODate(d);
}

/** Domingo da semana local que começa na segunda `weekStartISO` (YYYY-MM-DD). */
export function endOfWeekSundayFromMondayLocalISODate(weekStartISO) {
  const [y, m, day] = weekStartISO.split('-').map(Number);
  const d = new Date(y, m - 1, day + 6);
  return toLocalISODate(d);
}

export function lastOfMonthLocalISODate(ref = new Date()) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const last = new Date(y, m + 1, 0);
  return toLocalISODate(last);
}

/**
 * Intervalo [start, end] para o ranking (datas locais do dispositivo).
 * @param {'day' | 'week' | 'month'} period
 */
export function leaderboardDateRangeForPeriod(period) {
  const now = new Date();
  if (period === 'day') {
    const t = todayLocalISODate();
    return { start: t, end: t };
  }
  if (period === 'week') {
    const start = startOfWeekMondayLocalISODate(now);
    const end = endOfWeekSundayFromMondayLocalISODate(start);
    return { start, end };
  }
  const start = firstOfMonthLocalISODate();
  const end = lastOfMonthLocalISODate(now);
  return { start, end };
}

function parseLocalDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Rótulo curto para o filtro do ranking (pt-BR). */
export function rankingPeriodRangeLabel(period, startISO, endISO) {
  const sameDay = startISO === endISO;
  if (period === 'day' || sameDay) {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(parseLocalDate(startISO));
  }
  if (period === 'month') {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
      parseLocalDate(startISO)
    );
  }
  const short = { day: 'numeric', month: 'short' };
  const a = new Intl.DateTimeFormat('pt-BR', short).format(parseLocalDate(startISO));
  const b = new Intl.DateTimeFormat('pt-BR', short).format(parseLocalDate(endISO));
  return `${a} – ${b}`;
}
