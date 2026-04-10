/**
 * Botões do modal de check-in (UI). Alinhado com a RPC admin_tipo_treino_catalog.
 * "Treino Geral" aparece por último — serve como fallback e permite isenção de foto no admin.
 */
export const CHECKIN_GRID_WORKOUT_TYPES = [
  'Musculação',
  'Cárdio',
  'Funcional',
  'Luta',
  'Crossfit',
  'Outro',
  'Treino Geral'
];

/**
 * Presets canônicos (mesmo conteúdo agora que o grid inclui Treino Geral).
 */
export const CANONICAL_WORKOUT_TYPES = [...CHECKIN_GRID_WORKOUT_TYPES];
