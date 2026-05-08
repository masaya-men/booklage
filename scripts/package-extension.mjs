import { readFileSync, mkdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const root = 'extension'
if (!existsSync(root)) {
  console.error(`✗ Missing ${root}/ directory`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
const version = manifest.version

// Verify all referenced JS / HTML / CSS files actually exist
const required = [
  'manifest.json',
  'background.js',
  'offscreen.html',
  'offscreen.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.js',
  'popup.css',
  'options.html',
  'options.js',
  'options.css',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  '_locales/en/messages.json',
  'lib/dispatch.js',
  'lib/ogp.js',
  'lib/pill-state-machine.js',
  'lib/offscreen-router.js',
]
const missing = required.filter((f) => !existsSync(join(root, f)))
if (missing.length > 0) {
  console.error('✗ Missing required files:')
  missing.forEach((f) => console.error('  -', f))
  process.exit(1)
}

mkdirSync('dist', { recursive: true })
const out = `dist/booklage-extension-${version}.zip`

// Use platform-appropriate zip tool. PowerShell's Compress-Archive on Windows; zip on macOS/Linux/Git Bash.
const isWin = process.platform === 'win32'
if (isWin) {
  execSync(
    `powershell -Command "Compress-Archive -Path '${root}/*' -DestinationPath '${out}' -Force"`,
    { stdio: 'inherit' },
  )
} else {
  execSync(`cd ${root} && zip -r ../${out} . -x "*.DS_Store" "**/.*"`, { stdio: 'inherit' })
}

const size = statSync(out).size
console.log(`✓ Packaged ${out} (${(size / 1024).toFixed(1)} KB)`)
if (size > 200_000) console.warn(`⚠ Size > 200 KB target — consider removing assets`)
