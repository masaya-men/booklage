// lib/share/types.ts

export type ShareAspect = 'free' | '1:1' | '9:16' | '16:9'
export type ShareCardType = 'tweet' | 'youtube' | 'tiktok' | 'instagram' | 'image' | 'website'
export type ShareSize = 'S' | 'M' | 'L'

/** Schema version (bumps require backward-compatible decoder). */
export const SHARE_SCHEMA_VERSION = 1

/** Single card embedded in a share payload. Fields are short keys to keep URL compact. */
export type ShareCard = {
  /** bookmark URL (http/https only) */
  readonly u: string
  /** title (truncated to MAX_TITLE) */
  readonly t: string
  /** description (optional, truncated to MAX_DESCRIPTION) */
  readonly d?: string
  /** thumbnail URL (optional, http/https only) */
  readonly th?: string
  /** url type — re-detected on import, NEVER trusted */
  readonly ty: ShareCardType
  /** position x (0..1 normalized to frame width) */
  readonly x: number
  /** position y (0..1 normalized to frame height) */
  readonly y: number
  /** width (0..1 normalized) */
  readonly w: number
  /** height (0..1 normalized) */
  readonly h: number
  /** size preset (echoed for round-trip parity, NOT canonical) */
  readonly s: ShareSize
  /** rotation degrees (-3..3) */
  readonly r?: number
}

export type ShareData = {
  readonly v: typeof SHARE_SCHEMA_VERSION
  readonly aspect: ShareAspect
  readonly cards: ReadonlyArray<ShareCard>
  /** future theme hint — recipient-side optional */
  readonly bg?: 'dark' | 'light'
}

// Limits — enforced in validate.ts. Single source of truth.
export const SHARE_LIMITS = {
  MAX_CARDS: 100,
  MAX_DECODED_BYTES: 50 * 1024,        // 50KB JSON
  MAX_FRAGMENT_BYTES: 4 * 1024,        // 4KB base64url
  MAX_URL: 2048,
  MAX_TITLE: 200,
  MAX_DESCRIPTION: 280,
} as const
