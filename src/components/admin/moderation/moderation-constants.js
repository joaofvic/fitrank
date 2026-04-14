export const STATUSES = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'rejected', label: 'Rejeitados' }
];

export const DEFAULT_REJECTION_REASONS = [
  { code: 'illegible_dark', label: 'Foto ilegível/escura', requires_note: false },
  { code: 'not_proof', label: 'Não comprova atividade', requires_note: false },
  { code: 'duplicate_reused', label: 'Foto duplicada/reutilizada', requires_note: false },
  { code: 'inappropriate', label: 'Conteúdo impróprio', requires_note: false },
  { code: 'screenshot', label: 'Foto de tela/print', requires_note: false },
  { code: 'workout_mismatch', label: 'Tipo de treino não condizente', requires_note: false },
  { code: 'other', label: 'Outro (exige observação)', requires_note: true }
];
