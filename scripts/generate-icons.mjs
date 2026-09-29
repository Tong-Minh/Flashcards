// Run once: node scripts/generate-icons.mjs
// Requires: npm install canvas (or use sharp)
// This generates PNG icons for the PWA manifest.
// If you don't want to install canvas, use any image editor to create:
//   public/icon-192.png  (192x192, indigo background with white "F")
//   public/icon-512.png  (512x512, indigo background with white "F")
//   public/icon-maskable.png (512x512, same but with safe-zone padding)

import { createCanvas } from 'canvas'
import { writeFileSync } from 'fs'

function makeIcon(size, padding = 0) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const r = size * 0.16

  // Background
  ctx.fillStyle = '#4f46e5'
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, r)
  ctx.fill()

  // Card shape
  const p = size * (0.18 + padding)
  const w = size - p * 2
  const h = size * 0.6
  const y = (size - h) / 2
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.beginPath()
  ctx.roundRect(p, y, w, h, size * 0.06)
  ctx.fill()

  // Lines on card
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  const lx = p + w * 0.12
  const lw = w * 0.76
  const lh = size * 0.05
  const lr = lh / 2
  ;[0.3, 0.5, 0.7].forEach((frac) => {
    const ly = y + h * frac - lh / 2
    const lineW = frac === 0.5 ? lw * 0.6 : lw
    ctx.beginPath()
    ctx.roundRect(lx, ly, lineW, lh, lr)
    ctx.fill()
  })

  return canvas.toBuffer('image/png')
}

try {
  writeFileSync('public/icon-192.png', makeIcon(192))
  writeFileSync('public/icon-512.png', makeIcon(512))
  writeFileSync('public/icon-maskable.png', makeIcon(512, 0.1))
  console.log('Icons generated.')
} catch {
  console.log('Install canvas to auto-generate: npm install canvas')
  console.log('Or manually place icon-192.png, icon-512.png, icon-maskable.png in /public')
}
