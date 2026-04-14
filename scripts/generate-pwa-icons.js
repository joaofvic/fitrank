/**
 * Gera ícones PWA mínimos usando Canvas do Node (via offscreen workaround).
 * Execute: node scripts/generate-pwa-icons.js
 * 
 * Alternativa: abra scripts/generate-icons.html no browser para gerar PNGs via Canvas API.
 * 
 * Este script cria SVGs que servem como placeholder válidos para PWA.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join(import.meta.dirname, '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

function generateSvg(size, maskable = false) {
  const r = maskable ? 0 : size * 0.18;
  const cx = size / 2;
  const cy = size * 0.42;
  const cr = size * 0.22;
  const fontSize = size * 0.28;
  const subFontSize = size * 0.09;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#000"/>
  <circle cx="${cx}" cy="${cy}" r="${cr}" fill="#22c55e"/>
  <text x="${cx}" y="${cy}" fill="#000" font-size="${fontSize}" font-weight="bold" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">F</text>
  <text x="${cx}" y="${size * 0.72}" fill="#22c55e" font-size="${subFontSize}" font-weight="900" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" letter-spacing="2">FITRANK</text>
</svg>`;
}

const icons = [
  { name: 'icon-192.svg', size: 192, maskable: false },
  { name: 'icon-512.svg', size: 512, maskable: false },
  { name: 'icon-maskable-192.svg', size: 192, maskable: true },
  { name: 'icon-maskable-512.svg', size: 512, maskable: true },
  { name: 'apple-touch-icon.svg', size: 180, maskable: false },
  { name: 'favicon.svg', size: 32, maskable: false },
];

for (const { name, size, maskable } of icons) {
  const svg = generateSvg(size, maskable);
  writeFileSync(join(OUT, name), svg, 'utf-8');
  console.log(`Created ${name} (${size}x${size})`);
}

console.log('\\nDone! Replace .svg files with .png for production.');
