/**
 * Gera código snake_case para photo_rejection_reasons, compatível com
 * admin_photo_rejection_reasons_save: ^[a-z][a-z0-9_]{0,62}$ (máx. 64).
 */

const CODE_RE = /^[a-z][a-z0-9_]{0,62}$/;

function fallbackCode() {
  const raw = `motivo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const s = raw.slice(0, 64);
  return CODE_RE.test(s) ? s : `m_${Date.now().toString(36)}`.slice(0, 64);
}

function slugifyRejectionReasonCode(label) {
  const trimmed = String(label ?? '').trim();
  if (!trimmed) return null;

  let s = trimmed
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  if (!s) {
    return fallbackCode();
  }

  if (!/^[a-z]/.test(s)) {
    s = `m_${s}`;
  }

  s = s.slice(0, 64);
  if (!CODE_RE.test(s)) {
    return fallbackCode();
  }
  return s;
}

/**
 * Gera um código único a partir do rótulo legível (para novo motivo).
 * @param {string} label
 * @param {string[]} existingCodes
 * @returns {string | null} null se o rótulo estiver vazio
 */
export function allocateCodeForNewRejectionReason(label, existingCodes) {
  const base = slugifyRejectionReasonCode(label);
  if (!base) return null;

  const set = new Set(existingCodes.map((c) => String(c).toLowerCase()));
  if (!set.has(base.toLowerCase())) {
    return base;
  }

  const safeBase = base.replace(/_+$/, '') || 'm';

  for (let n = 2; n < 10_000; n += 1) {
    const suffix = `_${n}`;
    const maxLen = 64 - suffix.length;
    if (maxLen < 1) break;
    const truncated = safeBase.slice(0, maxLen).replace(/_+$/, '') || 'm';
    const candidate = `${truncated}${suffix}`;
    if (CODE_RE.test(candidate) && !set.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return fallbackCode();
}
