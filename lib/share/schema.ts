// lib/share/schema.ts
import { z } from 'zod'
import { SHARE_SCHEMA_VERSION, SHARE_LIMITS } from './types'

const ShareCardTypeSchema = z.enum(['tweet', 'youtube', 'tiktok', 'instagram', 'image', 'website'])
const ShareSizeSchema = z.enum(['S', 'M', 'L'])
const ShareAspectSchema = z.enum(['free', '1:1', '9:16', '16:9'])

export const ShareCardSchema = z.object({
  u: z.string().min(1).max(SHARE_LIMITS.MAX_URL),
  t: z.string().max(SHARE_LIMITS.MAX_TITLE).default(''),
  d: z.string().max(SHARE_LIMITS.MAX_DESCRIPTION).optional(),
  th: z.string().max(SHARE_LIMITS.MAX_URL).optional(),
  ty: ShareCardTypeSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().positive(),
  h: z.number().finite().positive(),
  s: ShareSizeSchema,
  r: z.number().finite().min(-30).max(30).optional(),
})

export const ShareDataSchema = z.object({
  v: z.literal(SHARE_SCHEMA_VERSION),
  aspect: ShareAspectSchema,
  cards: z.array(ShareCardSchema).max(SHARE_LIMITS.MAX_CARDS),
  bg: z.enum(['dark', 'light']).optional(),
  fa: z.number().finite().min(0.3).max(4).optional(),
})

export type ShareCardParsed = z.infer<typeof ShareCardSchema>
export type ShareDataParsed = z.infer<typeof ShareDataSchema>
