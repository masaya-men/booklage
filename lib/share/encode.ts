// lib/share/encode.ts
import type { ShareData } from './types'

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  // Use Response + arrayBuffer pattern to stay type-safe across jsdom / browser
  const rs = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes.buffer.slice(0)))
      controller.close()
    },
  })
  const compressed = rs.pipeThrough(new CompressionStream('gzip') as TransformStream<Uint8Array, Uint8Array>)
  const buf = await new Response(compressed).arrayBuffer()
  return new Uint8Array(buf)
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const b64 = btoa(bin)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function encodeShareData(data: ShareData): Promise<string> {
  const json = JSON.stringify(data)
  const utf8 = new TextEncoder().encode(json)
  const compressed = await gzip(utf8)
  return toBase64Url(compressed)
}
