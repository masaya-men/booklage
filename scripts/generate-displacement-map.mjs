import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const SIZE = 512
const buf = Buffer.alloc(SIZE * SIZE * 4)

// Simple radial gradient with gentle sine wave distortion.
// R channel: x displacement. G channel: y displacement.
// Both centered at 128 (= 0.5 in 0-255 space, ≈ neutral).
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4
    const cx = SIZE / 2, cy = SIZE / 2
    const dx = x - cx, dy = y - cy
    const r = Math.sqrt(dx * dx + dy * dy) / (SIZE / 2)

    // Radial base + mild angular ripple
    const angle = Math.atan2(dy, dx)
    const rippleX = Math.sin(angle * 3 + r * 6) * 40
    const rippleY = Math.cos(angle * 3 + r * 6) * 40

    buf[i] = Math.max(0, Math.min(255, 128 + rippleX))     // R (x displacement)
    buf[i + 1] = Math.max(0, Math.min(255, 128 + rippleY)) // G (y displacement)
    buf[i + 2] = 0
    buf[i + 3] = 255
  }
}

mkdirSync('public/displacement', { recursive: true })
await sharp(buf, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png()
  .toFile('public/displacement/glass-001.png')

console.log('Wrote public/displacement/glass-001.png (512x512, radial ripple)')
