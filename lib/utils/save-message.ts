import { z } from 'zod'

const SaveMessagePayload = z.object({
  url: z.string().min(1),
  title: z.string(),
  description: z.string(),
  image: z.string(),
  favicon: z.string(),
  siteName: z.string(),
  nonce: z.string().min(1),
})

const SaveMessage = z.object({
  type: z.literal('booklage:save'),
  payload: SaveMessagePayload,
})

export type SaveMessageInput = z.infer<typeof SaveMessage>

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export function parseSaveMessage(input: unknown): ParseResult<SaveMessageInput> {
  const r = SaveMessage.safeParse(input)
  if (r.success) return { ok: true, value: r.data }
  return {
    ok: false,
    error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  }
}

export type SaveMessageResult =
  | { type: 'booklage:save:result'; nonce: string; ok: true; bookmarkId: string }
  | { type: 'booklage:save:result'; nonce: string; ok: false; error: string }

const ProbeMessage = z.object({
  type: z.literal('booklage:probe'),
  payload: z.object({ nonce: z.string().min(1) }),
})
export type ProbeMessageInput = z.infer<typeof ProbeMessage>
export function parseProbeMessage(input: unknown): ParseResult<ProbeMessageInput> {
  const r = ProbeMessage.safeParse(input)
  if (r.success) return { ok: true, value: r.data }
  return {
    ok: false,
    error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  }
}

const ProbeResultSchema = z.object({
  type: z.literal('booklage:probe:result'),
  nonce: z.string().min(1),
  pipActive: z.boolean(),
})
export type ProbeResult = z.infer<typeof ProbeResultSchema>
export function parseProbeResult(input: unknown): ParseResult<ProbeResult> {
  const r = ProbeResultSchema.safeParse(input)
  if (r.success) return { ok: true, value: r.data }
  return {
    ok: false,
    error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  }
}
