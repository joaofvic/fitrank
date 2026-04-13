const GRAVITY = 0.12;
const DRAG = 0.98;
const TICK_MS = 16;

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

function createParticle(x, y, colors) {
  const angle = randomBetween(0, Math.PI * 2);
  const speed = randomBetween(4, 12);
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - randomBetween(2, 6),
    w: randomBetween(6, 12),
    h: randomBetween(4, 8),
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: randomBetween(0, 360),
    rotSpeed: randomBetween(-8, 8),
    opacity: 1
  };
}

const PRESETS = {
  achievement: ['#22c55e', '#eab308', '#86efac', '#fde047'],
  rainbow: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'],
  bronze: ['#cd7f32', '#b87333', '#da9e62', '#f5deb3'],
  silver: ['#c0c0c0', '#d8d8d8', '#a0a0a0', '#e8e8e8'],
  gold: ['#ffd700', '#ffb700', '#fde047', '#fbbf24'],
  platinum: ['#00bcd4', '#4dd0e1', '#80deea', '#b2ebf2'],
  diamond: ['#b388ff', '#7c4dff', '#ea80fc', '#e1bee7'],
  checkin: ['#22c55e', '#4ade80', '#86efac']
};

/**
 * Dispara confetti no viewport usando Canvas overlay.
 * @param {{ preset?: string, colors?: string[], particleCount?: number, durationMs?: number, origin?: { x: number, y: number } }} options
 */
export function fireConfetti(options = {}) {
  const {
    preset = 'achievement',
    colors = PRESETS[preset] ?? PRESETS.achievement,
    particleCount = 80,
    durationMs = 2500,
    origin = { x: 0.5, y: 0.4 }
  } = options;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const cx = canvas.width * origin.x;
  const cy = canvas.height * origin.y;

  const particles = Array.from({ length: particleCount }, () =>
    createParticle(cx, cy, colors)
  );

  const startTime = performance.now();
  let rafId;

  function tick(now) {
    const elapsed = now - startTime;
    const fadeStart = durationMs * 0.6;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.vy += GRAVITY;
      p.vx *= DRAG;
      p.vy *= DRAG;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotSpeed;

      if (elapsed > fadeStart) {
        p.opacity = Math.max(0, 1 - (elapsed - fadeStart) / (durationMs - fadeStart));
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (elapsed < durationMs) {
      rafId = requestAnimationFrame(tick);
    } else {
      canvas.remove();
    }
  }

  rafId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(rafId);
    canvas.remove();
  };
}
