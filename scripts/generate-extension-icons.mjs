import sharp from 'sharp'
import { mkdirSync, statSync } from 'node:fs'

mkdirSync('extension/icons', { recursive: true })

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="22" fill="#0a0a0c"/>
  <text x="64" y="78" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
        font-size="64" font-weight="700" fill="#ffffff" text-anchor="middle">B</text>
</svg>`

for (const size of [16, 32, 48, 128]) {
  const out = `extension/icons/icon-${size}.png`
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out)
  console.log(`✓ ${out} (${statSync(out).size} bytes)`)
}
