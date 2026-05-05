// lib/share/decode.ts
import { ShareDataSchema } from './schema'
import type { ShareData } from './types'

export type DecodeResult =
  | { readonly ok: true; readonly data: ShareData }
  | { readonly ok: false; readonly error: string }

function fromBase64Url(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const rs = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes.buffer.slice(0)))
      controller.close()
    },
  })
  const decompressed = rs.pipeThrough(new DecompressionStream('gzip') as TransformStream<Uint8Array, Uint8Array>)
  const buf = await new Response(decompressed).arrayBuffer()
  return new Uint8Array(buf)
}

export async function decodeShareData(fragment: string): Promise<DecodeResult> {
  if (!fragment) return { ok: false, error: 'empty fragment' }
  let bytes: Uint8Array
  try {
    bytes = fromBase64Url(fragment)
  } catch {
    return { ok: false, error: 'malformed base64' }
  }
  let decompressed: Uint8Array
  try {
    decompressed = await gunzip(bytes)
  } catch {
    return { ok: false, error: 'malformed gzip' }
  }
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(decompressed))
  } catch {
    return { ok: false, error: 'malformed json' }
  }
  const parsed = ShareDataSchema.safeParse(json)
  if (!parsed.success) return { ok: false, error: 'invalid schema' }
  return { ok: true, data: parsed.data as ShareData }
}
