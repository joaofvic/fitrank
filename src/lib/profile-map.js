import { defaultUserData } from './persist.js';

/** Converte linha `profiles` (Auth) para o formato usado pelas views. */
export function profileToUserData(profile, userId) {
  if (!profile || !userId) {
    return { ...defaultUserData(), uid: userId || defaultUserData().uid };
  }
  return {
    uid: userId,
    nome: profile.display_name || profile.nome || 'Atleta',
    pontos: profile.pontos ?? 0,
    streak: profile.streak ?? 0,
    is_pro: profile.is_pro ?? false,
    academia: profile.academia || '',
    last_checkin: profile.last_checkin_date || null,
    created_at: profile.created_at || new Date().toISOString()
  };
}
