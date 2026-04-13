const CARD_W = 1080;
const CARD_H = 1920;
const PADDING = 60;

const WORKOUT_LABELS = {
  musculacao: 'Musculação',
  crossfit: 'CrossFit',
  funcional: 'Funcional',
  cardio: 'Cárdio',
  corrida: 'Corrida',
  outro: 'Treino'
};

function normalizeType(type) {
  return (type ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Gera um branded share card como Blob PNG.
 * @param {{ fotoUrl?: string, displayName: string, workoutType: string, points: number, streak: number }} data
 * @returns {Promise<Blob>}
 */
export async function generateShareCard({ fotoUrl, displayName, workoutType, points, streak }) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, CARD_H);
  gradient.addColorStop(0, '#0a0a0a');
  gradient.addColorStop(0.5, '#111111');
  gradient.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const accentGrad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  accentGrad.addColorStop(0, 'rgba(34,197,94,0.08)');
  accentGrad.addColorStop(0.5, 'rgba(34,197,94,0.15)');
  accentGrad.addColorStop(1, 'rgba(34,197,94,0.04)');
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#22c55e';
  ctx.textAlign = 'center';
  ctx.fillText('FITRANK', CARD_W / 2, 120);

  ctx.font = '28px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('fitness social ranking', CARD_W / 2, 165);

  const photoY = 240;
  const photoSize = CARD_W - PADDING * 2;
  const photoRadius = 40;

  if (fotoUrl) {
    try {
      const img = await loadImage(fotoUrl);
      ctx.save();
      roundRect(ctx, PADDING, photoY, photoSize, photoSize, photoRadius);
      ctx.clip();
      const scale = Math.max(photoSize / img.width, photoSize / img.height);
      const sw = photoSize / scale;
      const sh = photoSize / scale;
      const sx = (img.width - sw) / 2;
      const sy = (img.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, PADDING, photoY, photoSize, photoSize);
      ctx.restore();
    } catch {
      drawPhotoPlaceholder(ctx, PADDING, photoY, photoSize, photoRadius, workoutType);
    }
  } else {
    drawPhotoPlaceholder(ctx, PADDING, photoY, photoSize, photoRadius, workoutType);
  }

  const overlayH = 200;
  const overlayY = photoY + photoSize - overlayH;
  const overlayGrad = ctx.createLinearGradient(0, overlayY, 0, photoY + photoSize);
  overlayGrad.addColorStop(0, 'rgba(0,0,0,0)');
  overlayGrad.addColorStop(0.4, 'rgba(0,0,0,0.7)');
  overlayGrad.addColorStop(1, 'rgba(0,0,0,0.95)');
  ctx.save();
  roundRect(ctx, PADDING, photoY, photoSize, photoSize, photoRadius);
  ctx.clip();
  ctx.fillStyle = overlayGrad;
  ctx.fillRect(PADDING, overlayY, photoSize, overlayH);
  ctx.restore();

  const labelKey = normalizeType(workoutType);
  const label = WORKOUT_LABELS[labelKey] ?? workoutType ?? 'Treino';

  ctx.save();
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  const tagW = ctx.measureText(label.toUpperCase()).width + 32;
  const tagH = 44;
  const tagX = PADDING + 30;
  const tagY = photoY + photoSize - 70;
  roundRect(ctx, tagX, tagY, tagW, tagH, tagH / 2);
  ctx.fillStyle = 'rgba(34,197,94,0.2)';
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), tagX + 16, tagY + tagH / 2);
  ctx.restore();

  const statsY = photoY + photoSize + 80;

  ctx.textAlign = 'center';
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(displayName, CARD_W / 2, statsY);

  const cardW = 280;
  const cardH = 140;
  const cardRadius = 24;
  const gap = 40;
  const totalW = cardW * 2 + gap;
  const startX = (CARD_W - totalW) / 2;
  const cardsY = statsY + 50;

  drawStatCard(ctx, startX, cardsY, cardW, cardH, cardRadius, `+${points}`, 'PONTOS', '#22c55e');
  drawStatCard(ctx, startX + cardW + gap, cardsY, cardW, cardH, cardRadius, `${streak}`, streak === 1 ? 'DIA SEGUIDO' : 'DIAS SEGUIDOS', '#f97316');

  ctx.font = '26px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.textAlign = 'center';
  ctx.fillText('fitrank.app', CARD_W / 2, CARD_H - 80);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Falha ao gerar imagem'));
    }, 'image/png');
  });
}

function drawPhotoPlaceholder(ctx, x, y, size, radius, workoutType) {
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.fillStyle = '#18181b';
  ctx.fill();
  ctx.font = 'bold 120px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#27272a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelKey = normalizeType(workoutType);
  const emoji = { musculacao: '💪', crossfit: '⚡', funcional: '🏋️', cardio: '❤️', corrida: '🏃', outro: '🔥' };
  ctx.fillText(emoji[labelKey] ?? '🔥', x + size / 2, y + size / 2);
  ctx.restore();
}

function drawStatCard(ctx, x, y, w, h, r, value, label, color) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(39,39,42,0.6)';
  ctx.fill();
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = 'rgba(63,63,70,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(value, x + w / 2, y + 60);

  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(label, x + w / 2, y + 100);
  ctx.restore();
}
