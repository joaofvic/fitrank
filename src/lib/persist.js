const STORAGE_KEY = 'fitrank-local-v1';

export function defaultUserData() {
  return {
    uid: 'local-user',
    nome: 'Atleta FitRank',
    pontos: 0,
    streak: 0,
    is_pro: false,
    academia: '',
    last_checkin: null,
    created_at: new Date().toISOString()
  };
}

export function loadFitRankState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.userData?.uid) return null;
    return {
      userData: { ...defaultUserData(), ...data.userData },
      checkins: Array.isArray(data.checkins) ? data.checkins : []
    };
  } catch {
    return null;
  }
}

export function saveFitRankState({ userData, checkins }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userData, checkins }));
  } catch (e) {
    console.error('FitRank: falha ao salvar dados locais', e);
  }
}
