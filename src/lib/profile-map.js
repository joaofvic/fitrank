import { defaultUserData } from './persist.js';

function isStreakAlive(lastCheckinDate) {
  if (!lastCheckinDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const [y, m, d] = lastCheckinDate.split('-').map(Number);
  const last = new Date(y, m - 1, d);
  last.setHours(0, 0, 0, 0);
  return last.getTime() === today.getTime() || last.getTime() === yesterday.getTime();
}

/** Converte linha `profiles` (Auth) para o formato usado pelas views. */
export function profileToUserData(profile, userId) {
  if (!profile || !userId) {
    return { ...defaultUserData(), uid: userId || defaultUserData().uid };
  }
  const dbStreak = profile.streak ?? 0;
  return {
    uid: userId,
    nome: profile.display_name || profile.nome || 'Atleta',
    pontos: profile.pontos ?? 0,
    streak: isStreakAlive(profile.last_checkin_date) ? dbStreak : 0,
    is_pro: profile.is_pro ?? false,
    academia: profile.academia || '',
    last_checkin: profile.last_checkin_date || null,
    created_at: profile.created_at || new Date().toISOString()
  };
}
