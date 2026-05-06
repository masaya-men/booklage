// lib/share/decode.ts
import { ShareDataSchema } from './schema'
import type { ShareData } from './types'

export type DecodeStage = 'empty' | 'base64' | 'gzip' | 'json' | 'schema'

export type DecodeDiagnostics = {
  readonly stage: DecodeStage
  readonly error: string
  readonly fragmentLen: number
  readonly bytesLen?: number
  readonly headHex?: string
  readonly tailHex?: string
  readonly decompressedLen?: number
  readonly jsonPreview?: string
  readonly rawError?: string
}

export type DecodeResult =
  | { readonly ok: true; readonly data: ShareData }
  | ({ readonly ok: false } & DecodeDiagnostics)

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

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
    if (i < bytes.length - 1) out += ' '
  }
  return out
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export async function decodeShareData(fragment: string): Promise<DecodeResult> {
  const fragmentLen = fragment.length
  if (!fragment) {
    return { ok: false, stage: 'empty', error: 'empty fragment', fragmentLen }
  }

  let bytes: Uint8Array
  try {
    bytes = fromBase64Url(fragment)
  } catch (e) {
    return {
      ok: false,
      stage: 'base64',
      error: 'malformed base64',
      fragmentLen,
      rawError: errMessage(e),
    }
  }

  const headHex = toHex(bytes.slice(0, 4))
  const tailHex = toHex(bytes.slice(Math.max(0, bytes.length - 16)))

  let decompressed: Uint8Array
  try {
    decompressed = await gunzip(bytes)
  } catch (e) {
    return {
      ok: false,
      stage: 'gzip',
      error: 'malformed gzip',
      fragmentLen,
      bytesLen: bytes.length,
      headHex,
      tailHex,
      rawError: errMessage(e),
    }
  }

  let jsonText = ''
  let json: unknown
  try {
    jsonText = new TextDecoder().decode(decompressed)
    json = JSON.parse(jsonText)
  } catch (e) {
    return {
      ok: false,
      stage: 'json',
      error: 'malformed json',
      fragmentLen,
      bytesLen: bytes.length,
      headHex,
      tailHex,
      decompressedLen: decompressed.length,
      jsonPreview: jsonText.slice(0, 200),
      rawError: errMessage(e),
    }
  }

  const parsed = ShareDataSchema.safeParse(json)
  if (!parsed.success) {
    return {
      ok: false,
      stage: 'schema',
      error: 'invalid schema',
      fragmentLen,
      bytesLen: bytes.length,
      headHex,
      tailHex,
      decompressedLen: decompressed.length,
      jsonPreview: jsonText.slice(0, 200),
      rawError: parsed.error.message,
    }
  }

  return { ok: true, data: parsed.data as ShareData }
}
