let audioCtx = null;
let muted = false;

function getCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', gain = 0.3) {
  const ctx = getCtx();
  if (!ctx || muted) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playSequence(notes) {
  const ctx = getCtx();
  if (!ctx || muted) return;
  let offset = 0;
  for (const { freq, dur, type = 'sine', gain = 0.25 } of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + offset);
    g.gain.setValueAtTime(gain, ctx.currentTime + offset);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(ctx.currentTime + offset);
    osc.stop(ctx.currentTime + offset + dur);
    offset += dur * 0.7;
  }
}

const SOUNDS = {
  checkin: () => playSequence([
    { freq: 523, dur: 0.1, type: 'triangle' },
    { freq: 659, dur: 0.1, type: 'triangle' },
    { freq: 784, dur: 0.15, type: 'triangle' }
  ]),

  streak: () => playSequence([
    { freq: 440, dur: 0.1, type: 'triangle' },
    { freq: 554, dur: 0.1, type: 'triangle' },
    { freq: 659, dur: 0.1, type: 'triangle' },
    { freq: 880, dur: 0.2, type: 'triangle', gain: 0.3 }
  ]),

  badge: () => playSequence([
    { freq: 392, dur: 0.12, type: 'square', gain: 0.15 },
    { freq: 523, dur: 0.12, type: 'square', gain: 0.15 },
    { freq: 659, dur: 0.12, type: 'square', gain: 0.15 },
    { freq: 784, dur: 0.12, type: 'square', gain: 0.15 },
    { freq: 1047, dur: 0.3, type: 'sine', gain: 0.2 }
  ]),

  levelUp: () => playSequence([
    { freq: 262, dur: 0.08, type: 'sawtooth', gain: 0.12 },
    { freq: 330, dur: 0.08, type: 'sawtooth', gain: 0.12 },
    { freq: 392, dur: 0.08, type: 'sawtooth', gain: 0.12 },
    { freq: 523, dur: 0.08, type: 'sawtooth', gain: 0.12 },
    { freq: 659, dur: 0.08, type: 'sawtooth', gain: 0.12 },
    { freq: 784, dur: 0.15, type: 'sine', gain: 0.2 },
    { freq: 1047, dur: 0.3, type: 'sine', gain: 0.25 }
  ]),

  leaguePromotion: () => {
    playSequence([
      { freq: 262, dur: 0.15, type: 'triangle', gain: 0.2 },
      { freq: 330, dur: 0.15, type: 'triangle', gain: 0.2 },
      { freq: 392, dur: 0.15, type: 'triangle', gain: 0.2 },
      { freq: 523, dur: 0.2, type: 'triangle', gain: 0.25 },
      { freq: 659, dur: 0.2, type: 'sine', gain: 0.25 },
      { freq: 784, dur: 0.25, type: 'sine', gain: 0.3 },
      { freq: 1047, dur: 0.4, type: 'sine', gain: 0.3 }
    ]);
  },

  boost: () => playSequence([
    { freq: 440, dur: 0.06, type: 'square', gain: 0.12 },
    { freq: 660, dur: 0.06, type: 'square', gain: 0.12 },
    { freq: 880, dur: 0.15, type: 'sine', gain: 0.2 }
  ]),

  like: () => playTone(880, 0.08, 'sine', 0.1),

  error: () => playSequence([
    { freq: 330, dur: 0.15, type: 'sawtooth', gain: 0.12 },
    { freq: 220, dur: 0.25, type: 'sawtooth', gain: 0.12 }
  ])
};

/**
 * Toca um som sintetizado por nome.
 * @param {'checkin'|'streak'|'badge'|'levelUp'|'leaguePromotion'|'boost'|'like'|'error'} name
 */
export function playSound(name) {
  try {
    SOUNDS[name]?.();
  } catch {
    // fallback silencioso
  }
}

export function setMuted(val) { muted = Boolean(val); }
export function isMuted() { return muted; }
