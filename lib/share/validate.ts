// lib/share/validate.ts
import { detectUrlType, isValidUrl } from '@/lib/utils/url'
import { SHARE_LIMITS } from './types'
import type { ShareCard, ShareData } from './types'

function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function clampPositive(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0.001
  if (n > 1) return 1
  return n
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

/**
 * Run all post-decode security normalizations:
 * - drop cards whose primary URL is not http/https (allowlist, spec §5 #1)
 * - drop thumbnail field if not http/https (keep the card)
 * - re-detect ty from URL (spec §5 #3 — never trust attacker payload)
 * - cap card count (spec §5 #4)
 * - truncate over-long strings (spec §5 #5)
 * - clamp positions/sizes to [0,1]
 */
export function sanitizeShareData(data: ShareData): ShareData {
  const cleaned: ShareCard[] = []
  for (const c of data.cards) {
    if (!isValidUrl(c.u)) continue
    const th = c.th && isValidUrl(c.th) ? c.th : undefined
    const detectedTy = detectUrlType(c.u)
    // Preserve ty='image' from the original payload only when detector says
    // 'website' (image URLs aren't recognized as a category by detectUrlType,
    // so 'image' is a forward-compat hint). Everything else is overwritten.
    const ty = c.ty === 'image' && detectedTy === 'website' ? 'image' : detectedTy
    const card: ShareCard = {
      u: truncate(c.u, SHARE_LIMITS.MAX_URL),
      t: truncate(c.t ?? '', SHARE_LIMITS.MAX_TITLE),
      d: c.d ? truncate(c.d, SHARE_LIMITS.MAX_DESCRIPTION) : undefined,
      th,
      ty,
      x: clampUnit(c.x),
      y: clampUnit(c.y),
      w: clampPositive(c.w),
      h: clampPositive(c.h),
      s: c.s,
      r: c.r !== undefined ? Math.max(-30, Math.min(30, c.r)) : undefined,
    }
    cleaned.push(card)
    if (cleaned.length >= SHARE_LIMITS.MAX_CARDS) break
  }
  // Clamp fa to a sane range — accept anything from very tall (9:16 ≈ 0.5625)
  // to very wide (16:9 ≈ 1.78) plus a margin for free-aspect drift.
  const fa = data.fa
  const cleanedFa =
    typeof fa === 'number' && Number.isFinite(fa) && fa > 0
      ? Math.max(0.25, Math.min(4, fa))
      : undefined
  return { ...data, cards: cleaned, fa: cleanedFa }
}
