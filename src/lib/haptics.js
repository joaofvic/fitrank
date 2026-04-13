const supported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

const PATTERNS = {
  light: [10],
  medium: [30],
  heavy: [50],
  success: [10, 50, 30],
  celebration: [10, 30, 10, 30, 50],
  error: [50, 30, 50],
  double: [15, 30, 15]
};

/**
 * Dispara feedback háptico (vibração) se suportado.
 * @param {'light'|'medium'|'heavy'|'success'|'celebration'|'error'|'double'} pattern
 */
export function haptic(pattern = 'light') {
  if (!supported) return;
  try {
    const p = PATTERNS[pattern] ?? PATTERNS.light;
    navigator.vibrate(p);
  } catch {
    // fallback silencioso
  }
}

export function isHapticSupported() { return supported; }
