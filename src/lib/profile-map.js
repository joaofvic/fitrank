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

/** Mesma fórmula do SQL: floor(sqrt(xp / 100)) */
export function calculateLevel(xp) {
  return Math.max(0, Math.floor(Math.sqrt((xp ?? 0) / 100)));
}

/** XP necessário para atingir um determinado nível */
export function xpForLevel(level) {
  return level * level * 100;
}

/** Calcula informações completas de nível a partir do XP bruto */
export function getLevelInfo(xp) {
  const currentXp = xp ?? 0;
  const level = calculateLevel(currentXp);
  const xpCurrentLevel = xpForLevel(level);
  const xpNextLevel = xpForLevel(level + 1);
  const range = xpNextLevel - xpCurrentLevel;
  const progressPct = range === 0 ? 100 : Math.round(((currentXp - xpCurrentLevel) / range) * 1000) / 10;
  return { currentXp, level, xpCurrentLevel, xpNextLevel, progressPct };
}

/** Converte linha `profiles` (Auth) para o formato usado pelas views. */
export function profileToUserData(profile, userId) {
  if (!profile || !userId) {
    return { ...defaultUserData(), uid: userId || defaultUserData().uid, xp: 0, level: 0, levelInfo: getLevelInfo(0) };
  }
  const dbStreak = profile.streak ?? 0;
  const xp = profile.xp ?? 0;
  const levelInfo = getLevelInfo(xp);
  return {
    uid: userId,
    nome: profile.display_name || profile.nome || 'Atleta',
    username: profile.username || null,
    avatar_url: profile.avatar_url || null,
    pontos: profile.pontos ?? 0,
    streak: isStreakAlive(profile.last_checkin_date) ? dbStreak : 0,
    is_pro: profile.is_pro ?? false,
    academia: profile.academia || '',
    last_checkin: profile.last_checkin_date || null,
    created_at: profile.created_at || new Date().toISOString(),
    xp,
    level: levelInfo.level,
    levelInfo,
    league: profile.league ?? 'bronze'
  };
}
