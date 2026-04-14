#!/usr/bin/env node
// Generates minimal PWA icons (solid purple #7c5cfc) as valid PNG files.
// No external dependencies — uses only Node.js built-in modules.
// Replace with designed icons before launch.

import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

// ── CRC32 ─────────────────────────────────────────────────
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[n] = c
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// ── PNG chunk builder ─────────────────────────────────────
function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, crcBuf])
}

// ── Solid-color PNG generator ─────────────────────────────
function createSolidPng(size, r, g, b) {
  const rowSize = 1 + size * 4
  const raw = Buffer.alloc(size * rowSize)

  for (let y = 0; y < size; y++) {
    const offset = y * rowSize
    raw[offset] = 0 // filter byte: None
    for (let x = 0; x < size; x++) {
      const px = offset + 1 + x * 4
      raw[px] = r
      raw[px + 1] = g
      raw[px + 2] = b
      raw[px + 3] = 255
    }
  }

  const compressed = deflateSync(raw)

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // color type: RGBA
  // bytes 10-12 default to 0 (compression, filter, interlace)

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Generate icons ────────────────────────────────────────
// Brand purple: #7c5cfc → R=124, G=92, B=252
writeFileSync('public/icon-192.png', createSolidPng(192, 0x7c, 0x5c, 0xfc))
writeFileSync('public/icon-512.png', createSolidPng(512, 0x7c, 0x5c, 0xfc))

console.log('Generated public/icon-192.png (192x192)')
console.log('Generated public/icon-512.png (512x512)')
