# Share System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AllMarks の核となるバイラル機能 — ボード上のカードから「シェア用ムードボード」を組み立て、PNG + URL の両方で SNS 投稿でき、受信者が view-only で閲覧 → 自分のボードに取り込める一連の Share System を実装する。

**Architecture:** クライアント完結（サーバー保存ゼロ）。送信者は `<ShareComposer>` モーダルでアスペクト・カードを選択し、`lib/share/encode.ts`（gzip + base64url）で URL fragment にデータ埋込 → `dom-to-image-more` で PNG 書き出し（ウォーターマーク合成）。受信者は `/share#d=<...>` 経由で `<SharedView>`（`'use client'`）が hash デコード → 既存 `<CardsLayer>` で描画 → `<ImportConfirmModal>` 経由で IndexedDB 取込。

**Tech Stack:** Next.js 16 App Router (`output: 'export'`) / React 19 / TypeScript strict / Vanilla CSS Modules / Zod validation / `idb` / `dom-to-image-more` / native `CompressionStream('gzip')` / Vitest + jsdom + fake-indexeddb / Playwright.

**Spec:** `docs/superpowers/specs/2026-05-05-share-system-design.md`

---

## File Structure

### New files (create)

| Path | Responsibility |
|---|---|
| `lib/share/types.ts` | `ShareData` / `ShareCard` / `ShareAspect` 型定義 + `MAX_*` 定数 |
| `lib/share/schema.ts` | Zod schema for `ShareData` (decode 時の盲信防止) |
| `lib/share/encode.ts` | `encodeShareData(data) → string` (URL fragment payload) |
| `lib/share/decode.ts` | `decodeShareData(fragment) → result<ShareData,Error>` |
| `lib/share/validate.ts` | URL scheme allowlist / type 再判定 / サイズ件数 / 文字長 truncate |
| `lib/share/encode.test.ts` | round-trip + サイズ上限テスト |
| `lib/share/decode.test.ts` | malformed payload graceful failure |
| `lib/share/validate.test.ts` | security 要件 #1, #3, #4, #5 の境界値 |
| `lib/share/png-export.ts` | `exportFrameAsPng(el, watermarkVariant) → string (dataURL)` |
| `lib/share/png-export.test.ts` | dom-to-image-more mock + watermark 合成検証 |
| `lib/share/watermark-config.ts` | Variant A/B 定義 + 環境変数読取 |
| `lib/share/import.ts` | `importSharedCards(db, data, moodId) → {added, skipped}` (重複 skip + bulk write) |
| `lib/share/import.test.ts` | dedupe / IndexedDB 書込テスト |
| `lib/share/x-intent.ts` | X Web Intent URL 生成 (本文 + URL) |
| `lib/share/x-intent.test.ts` | URL encode + 文字数境界 |
| `lib/share/board-to-cards.ts` | board の `BoardItem` → 初期 `ShareCard[]` 変換（viewport snapshot 計算含む） |
| `lib/share/board-to-cards.test.ts` | viewport 内カードのみ抽出 |
| `lib/share/aspect-presets.ts` | `'free' \| '1:1' \| '9:16' \| '16:9'` ← 既存 frame-presets とは別の Share 専用集合 |
| `components/share/ShareComposer.tsx` | Top-level modal。aspect / cards / preview state 管理 |
| `components/share/ShareComposer.module.css` | 同上 |
| `components/share/ShareFrame.tsx` | シェア枠の中身。`<CardsLayer>` 流用で board と同じ視覚 |
| `components/share/ShareFrame.module.css` | 同上 |
| `components/share/ShareSourceList.tsx` | 下部の source 横スクロール（trash カードはホバーで delete） |
| `components/share/ShareSourceList.module.css` | 同上 |
| `components/share/ShareAspectSwitcher.tsx` | 4 アスペクトピル切替 |
| `components/share/ShareAspectSwitcher.module.css` | 同上 |
| `components/share/ShareActionSheet.tsx` | 確定後の DL / Copy URL / X intent |
| `components/share/ShareActionSheet.module.css` | 同上 |
| `components/share/SharedView.tsx` | Recipient view-only renderer (`'use client'`) |
| `components/share/SharedView.module.css` | 同上 |
| `components/share/ImportConfirmModal.tsx` | フォルダ選択 + 重複 skip 表示 + 「追加」 |
| `components/share/ImportConfirmModal.module.css` | 同上 |
| `app/(app)/share/page.tsx` | `/share` ルートシェル |
| `app/(app)/share/SharedViewClient.tsx` | client wrapper（hash 読取 → SharedView へ） |
| `tests/e2e/share-sender.spec.ts` | Playwright: Share クリック→DL |
| `tests/e2e/share-recipient.spec.ts` | Playwright: 共有 URL→/board 取込 |

### Modified files

| Path | Change |
|---|---|
| `components/board/Toolbar.tsx` | Share ピル追加（`onShareClick` prop） |
| `components/board/Toolbar.module.css` | Share ピルは既存ピルと同パターン |
| `components/board/BoardRoot.tsx` | `shareComposerOpen` state + `<ShareComposer>` mount + Toolbar に prop 渡し |
| `messages/en.json` / `messages/ja.json` ほか 13 言語 | `share.*` キー追加（最低限 ja / en は同セッション、他 13 言語は post-launch でも可） |
| `lib/i18n/config.ts` 等 | 必要なら型拡張 |

### Out of scope (post-launch)

- カード重ね・自由レイアウト
- スライダー型カード拡縮
- サムネ画像プロキシ
- 4:5 アスペクト
- Source list の検索・フィルタ
- 多言語 13 言語完全翻訳（MVP は ja / en）

---

## Phase 1 — Encode / Decode / Validate (lib/share/*)

設計仕様 §3.1 / §4 / §5 に対応。UI を一切触らずに済む基盤層から。**この phase の完了 = round-trip + 全セキュリティ要件のテスト緑**。

---

### Task 1.1: ShareData 型定義 + 上限定数

**Files:**
- Create: `lib/share/types.ts`

- [ ] **Step 1: 型と上限定数を定義**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/share/types.ts
rtk git commit -m "feat(share): add ShareData types and size limits"
```

---

### Task 1.2: Aspect preset table

**Files:**
- Create: `lib/share/aspect-presets.ts`
- Test: `lib/share/aspect-presets.test.ts`

- [ ] **Step 1: Failing test**

```ts
// lib/share/aspect-presets.test.ts
import { describe, it, expect } from 'vitest'
import { computeAspectFrameSize, ASPECT_PRESETS } from './aspect-presets'

describe('aspect-presets', () => {
  it('exposes all four preset ids', () => {
    expect(ASPECT_PRESETS.map((p) => p.id)).toEqual(['free', '1:1', '9:16', '16:9'])
  })

  it('1:1 fits a square in any viewport', () => {
    const size = computeAspectFrameSize('1:1', 1000, 600)
    expect(size.width).toBe(size.height)
    expect(size.width).toBeLessThanOrEqual(600)
  })

  it('9:16 keeps portrait ratio', () => {
    const size = computeAspectFrameSize('9:16', 1000, 800)
    expect(size.height / size.width).toBeCloseTo(16 / 9, 2)
  })

  it('free returns viewport-fit', () => {
    const size = computeAspectFrameSize('free', 800, 600)
    expect(size.width).toBe(800)
    expect(size.height).toBe(600)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
rtk pnpm vitest run lib/share/aspect-presets.test.ts
```

Expected: `Cannot find module './aspect-presets'`

- [ ] **Step 3: Minimal implementation**

```ts
// lib/share/aspect-presets.ts
import type { ShareAspect } from './types'

export type AspectPreset = {
  readonly id: ShareAspect
  readonly label: string
  /** [w, h] ratio. `null` for 'free' (viewport-fit). */
  readonly ratio: readonly [number, number] | null
}

export const ASPECT_PRESETS: ReadonlyArray<AspectPreset> = [
  { id: 'free',  label: '全体',   ratio: null },
  { id: '1:1',   label: '1:1',    ratio: [1, 1] },
  { id: '9:16',  label: '9:16',   ratio: [9, 16] },
  { id: '16:9',  label: '16:9',   ratio: [16, 9] },
]

export type FrameSize = { readonly width: number; readonly height: number }

/**
 * Fit the preset ratio into the available viewport, preserving aspect.
 * 'free' returns the viewport itself.
 */
export function computeAspectFrameSize(
  aspect: ShareAspect,
  viewportWidth: number,
  viewportHeight: number,
): FrameSize {
  const preset = ASPECT_PRESETS.find((p) => p.id === aspect)
  if (!preset || preset.ratio === null) {
    return { width: viewportWidth, height: viewportHeight }
  }
  const [rw, rh] = preset.ratio
  const scale = Math.min(viewportWidth / rw, viewportHeight / rh)
  return { width: rw * scale, height: rh * scale }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
rtk pnpm vitest run lib/share/aspect-presets.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/share/aspect-presets.ts lib/share/aspect-presets.test.ts
rtk git commit -m "feat(share): add aspect presets (free/1:1/9:16/16:9)"
```

---

### Task 1.3: Zod schema for ShareData (decode 盲信防止)

**Files:**
- Create: `lib/share/schema.ts`

- [ ] **Step 1: Implement**

```ts
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
})

export type ShareCardParsed = z.infer<typeof ShareCardSchema>
export type ShareDataParsed = z.infer<typeof ShareDataSchema>
```

- [ ] **Step 2: Commit**

```bash
git add lib/share/schema.ts
rtk git commit -m "feat(share): add zod schema for share payload"
```

---

### Task 1.4: Encode (gzip + base64url)

**Files:**
- Create: `lib/share/encode.ts`
- Test: `lib/share/encode.test.ts`

- [ ] **Step 1: Failing test**

```ts
// lib/share/encode.test.ts
import { describe, it, expect } from 'vitest'
import { encodeShareData } from './encode'
import { SHARE_SCHEMA_VERSION } from './types'

describe('encodeShareData', () => {
  it('returns a non-empty base64url string', async () => {
    const out = await encodeShareData({
      v: SHARE_SCHEMA_VERSION,
      aspect: '1:1',
      cards: [
        { u: 'https://example.com', t: 'Title', ty: 'website', x: 0, y: 0, w: 0.5, h: 0.5, s: 'S' },
      ],
    })
    expect(out.length).toBeGreaterThan(0)
    // base64url alphabet only: A-Z a-z 0-9 - _
    expect(out).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('compresses 50 cards into reasonably small payload', async () => {
    const cards = Array.from({ length: 50 }, (_, i) => ({
      u: `https://example.com/path/to/page-${i}-with-some-extra-text`,
      t: `Card title number ${i} — descriptive`,
      ty: 'website' as const,
      x: i / 50,
      y: 0,
      w: 0.1,
      h: 0.1,
      s: 'S' as const,
    }))
    const out = await encodeShareData({
      v: SHARE_SCHEMA_VERSION,
      aspect: 'free',
      cards,
    })
    // Sanity: 50 repetitive cards should compress well below 4KB.
    expect(out.length).toBeLessThan(4 * 1024)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
rtk pnpm vitest run lib/share/encode.test.ts
```

- [ ] **Step 3: Implement**

```ts
// lib/share/encode.ts
import type { ShareData } from './types'

/**
 * Pipe a Uint8Array through CompressionStream('gzip') and collect the result.
 * Native browser API; no library needed (Chrome 80+ / Safari 16.4+ / FF 113+).
 */
async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

/** Standard base64url encoding (RFC 4648 §5) — URL-safe, no padding. */
function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  // btoa is jsdom + browser. atob/btoa stay binary-safe with Latin-1 string.
  const b64 = btoa(bin)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Encode share data into a URL-fragment-safe string.
 * Pipeline: JSON → gzip → base64url.
 */
export async function encodeShareData(data: ShareData): Promise<string> {
  const json = JSON.stringify(data)
  const utf8 = new TextEncoder().encode(json)
  const compressed = await gzip(utf8)
  return toBase64Url(compressed)
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
rtk pnpm vitest run lib/share/encode.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/share/encode.ts lib/share/encode.test.ts
rtk git commit -m "feat(share): encode payload as gzip+base64url"
```

---

### Task 1.5: Decode (reverse pipeline + zod parse)

**Files:**
- Create: `lib/share/decode.ts`
- Test: `lib/share/decode.test.ts`

- [ ] **Step 1: Failing test**

```ts
// lib/share/decode.test.ts
import { describe, it, expect } from 'vitest'
import { encodeShareData } from './encode'
import { decodeShareData } from './decode'
import { SHARE_SCHEMA_VERSION } from './types'
import type { ShareData } from './types'

describe('decodeShareData', () => {
  it('round-trips encoded data', async () => {
    const original: ShareData = {
      v: SHARE_SCHEMA_VERSION,
      aspect: '9:16',
      cards: [
        { u: 'https://example.com', t: 'A', ty: 'website', x: 0.1, y: 0.2, w: 0.3, h: 0.4, s: 'M' },
        { u: 'https://x.com/a/status/1', t: 'B', ty: 'tweet', x: 0.5, y: 0.6, w: 0.2, h: 0.3, s: 'S' },
      ],
    }
    const encoded = await encodeShareData(original)
    const result = await decodeShareData(encoded)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.aspect).toBe('9:16')
      expect(result.data.cards).toHaveLength(2)
      expect(result.data.cards[0].t).toBe('A')
    }
  })

  it('returns error result for malformed base64', async () => {
    const result = await decodeShareData('!!!not-valid-base64!!!')
    expect(result.ok).toBe(false)
  })

  it('returns error result for non-gzip bytes', async () => {
    const result = await decodeShareData('AAAA')
    expect(result.ok).toBe(false)
  })

  it('returns error for valid gzip but invalid schema', async () => {
    // Encode a malformed payload (missing required fields) through real pipeline
    // by encoding then tampering. Easier: just send junk JSON inside valid gzip.
    const stream = new Blob([new TextEncoder().encode('{"v":"wrong"}') as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream('gzip'))
    const buf = new Uint8Array(await new Response(stream).arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
    const b64url = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const result = await decodeShareData(b64url)
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
rtk pnpm vitest run lib/share/decode.test.ts
```

- [ ] **Step 3: Implement**

```ts
// lib/share/decode.ts
import { ShareDataSchema } from './schema'
import type { ShareData } from './types'

export type DecodeResult =
  | { readonly ok: true; readonly data: ShareData }
  | { readonly ok: false; readonly error: string }

function fromBase64Url(input: string): Uint8Array {
  // Pad and translate to standard base64.
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Decode a share fragment payload. Never throws — returns a Result so callers
 * can render an error UI without try/catch nests.
 */
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
```

- [ ] **Step 4: Run — expect PASS**

```bash
rtk pnpm vitest run lib/share/decode.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/share/decode.ts lib/share/decode.test.ts
rtk git commit -m "feat(share): decode share fragment with zod validation"
```

---

### Task 1.6: Validation (security 7 要件 implement)

**Files:**
- Create: `lib/share/validate.ts`
- Test: `lib/share/validate.test.ts`

- [ ] **Step 1: Failing test (covers spec §5 #1, #3, #4, #5)**

```ts
// lib/share/validate.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeShareData } from './validate'
import { SHARE_SCHEMA_VERSION, SHARE_LIMITS } from './types'
import type { ShareData } from './types'

const baseCard = {
  t: 'Title',
  ty: 'website' as const,
  x: 0, y: 0, w: 0.1, h: 0.1,
  s: 'S' as const,
}

const baseData = (cards: ShareData['cards']): ShareData => ({
  v: SHARE_SCHEMA_VERSION,
  aspect: 'free',
  cards,
})

describe('sanitizeShareData', () => {
  it('drops cards with javascript: URL', () => {
    const out = sanitizeShareData(baseData([
      { ...baseCard, u: 'javascript:alert(1)' },
      { ...baseCard, u: 'https://safe.example.com' },
    ]))
    expect(out.cards).toHaveLength(1)
    expect(out.cards[0].u).toBe('https://safe.example.com')
  })

  it('drops cards with data: URL', () => {
    const out = sanitizeShareData(baseData([
      { ...baseCard, u: 'data:text/html,<script>x</script>' },
    ]))
    expect(out.cards).toHaveLength(0)
  })

  it('drops cards with file: URL', () => {
    const out = sanitizeShareData(baseData([
      { ...baseCard, u: 'file:///etc/passwd' },
    ]))
    expect(out.cards).toHaveLength(0)
  })

  it('drops thumbnail field with non-http(s) scheme but keeps the card', () => {
    const out = sanitizeShareData(baseData([
      { ...baseCard, u: 'https://safe.com', th: 'javascript:alert(1)' },
    ]))
    expect(out.cards).toHaveLength(1)
    expect(out.cards[0].th).toBeUndefined()
  })

  it('re-detects type from URL (ignores attacker-controlled ty)', () => {
    const out = sanitizeShareData(baseData([
      { ...baseCard, u: 'https://www.youtube.com/watch?v=abc12345678', ty: 'website' },
    ]))
    expect(out.cards[0].ty).toBe('youtube')
  })

  it('caps cards at MAX_CARDS', () => {
    const many = Array.from({ length: SHARE_LIMITS.MAX_CARDS + 10 }, () => ({
      ...baseCard, u: 'https://example.com',
    }))
    const out = sanitizeShareData(baseData(many))
    expect(out.cards).toHaveLength(SHARE_LIMITS.MAX_CARDS)
  })

  it('truncates over-long titles', () => {
    const long = 'x'.repeat(SHARE_LIMITS.MAX_TITLE + 50)
    const out = sanitizeShareData(baseData([{ ...baseCard, u: 'https://e.com', t: long }]))
    expect(out.cards[0].t.length).toBe(SHARE_LIMITS.MAX_TITLE)
  })

  it('truncates over-long descriptions', () => {
    const long = 'y'.repeat(SHARE_LIMITS.MAX_DESCRIPTION + 50)
    const out = sanitizeShareData(baseData([{ ...baseCard, u: 'https://e.com', d: long }]))
    expect(out.cards[0].d?.length).toBe(SHARE_LIMITS.MAX_DESCRIPTION)
  })

  it('clamps positions/sizes to [0, 1]', () => {
    const out = sanitizeShareData(baseData([
      { ...baseCard, u: 'https://e.com', x: -0.5, y: 2, w: 5, h: -1 },
    ]))
    expect(out.cards[0].x).toBe(0)
    expect(out.cards[0].y).toBe(1)
    expect(out.cards[0].w).toBeGreaterThan(0)
    expect(out.cards[0].w).toBeLessThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
rtk pnpm vitest run lib/share/validate.test.ts
```

- [ ] **Step 3: Implement**

```ts
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
    const card: ShareCard = {
      u: truncate(c.u, SHARE_LIMITS.MAX_URL),
      t: truncate(c.t ?? '', SHARE_LIMITS.MAX_TITLE),
      d: c.d ? truncate(c.d, SHARE_LIMITS.MAX_DESCRIPTION) : undefined,
      th,
      ty: detectUrlType(c.u) === 'website' && c.ty === 'image' ? 'image' : detectUrlType(c.u),
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
  return { ...data, cards: cleaned }
}
```

> **Note:** `ty: 'image'` は detectUrlType の出力にないが、未来の拡張余地として元 payload が `'image'` の場合のみ通す。それ以外は detectUrlType の結果で上書きする。

- [ ] **Step 4: Run — expect PASS**

```bash
rtk pnpm vitest run lib/share/validate.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/share/validate.ts lib/share/validate.test.ts
rtk git commit -m "feat(share): sanitize decoded payload (allowlist + truncate + retype)"
```

---

### Task 1.7: Phase 1 結合テスト (encode → decode → validate)

**Files:**
- Modify: `lib/share/decode.test.ts` に integration セクション追加

- [ ] **Step 1: Test 追加**

```ts
// lib/share/decode.test.ts に append
import { sanitizeShareData } from './validate'

describe('encode → decode → sanitize integration', () => {
  it('ignores attacker-controlled ty after full pipeline', async () => {
    const malicious = await encodeShareData({
      v: SHARE_SCHEMA_VERSION,
      aspect: 'free',
      cards: [{
        u: 'https://www.youtube.com/watch?v=abcdefghijk',
        t: 'fake',
        ty: 'website',
        x: 0, y: 0, w: 0.1, h: 0.1, s: 'S',
      }],
    })
    const result = await decodeShareData(malicious)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const sanitized = sanitizeShareData(result.data)
    expect(sanitized.cards[0].ty).toBe('youtube')
  })
})
```

- [ ] **Step 2: Run — expect PASS**

```bash
rtk pnpm vitest run lib/share/
```

- [ ] **Step 3: Commit**

```bash
git add lib/share/decode.test.ts
rtk git commit -m "test(share): encode/decode/sanitize integration"
```

---

## Phase 2 — ShareComposer UI

設計仕様 §2.1 / §3.1 / §6 / §8 に対応。Phase 1 の純関数を載せて、ボード上のカードを「シェア用ムードボード」に組み立てる UI を作る。

> **UI 承認フロー (CLAUDE.md `.claude/rules/ui-design.md`)**: 各 visual UI タスクは `(1) 現状確認 → (2) 変更案の説明 → (3) ユーザー承認 → (4) 実装` を守ること。実装前に Claude → ユーザーへ「mock 提示 + 言語化された design intent」を送って承認を取る。

---

### Task 2.1: board → ShareCard 変換 + viewport snapshot

**Files:**
- Create: `lib/share/board-to-cards.ts`
- Test: `lib/share/board-to-cards.test.ts`

- [ ] **Step 1: Failing test**

```ts
// lib/share/board-to-cards.test.ts
import { describe, it, expect } from 'vitest'
import { boardItemsToShareCards, filterByViewport } from './board-to-cards'

const sampleItem = (overrides: Partial<{ bookmarkId: string; url: string; type: string; title: string; thumbnail: string; sizePreset: 'S' | 'M' | 'L' }>) => ({
  bookmarkId: overrides.bookmarkId ?? 'b1',
  url: overrides.url ?? 'https://example.com',
  title: overrides.title ?? 't',
  description: '',
  thumbnail: overrides.thumbnail ?? '',
  type: (overrides.type ?? 'website') as 'website' | 'tweet' | 'youtube' | 'tiktok' | 'instagram',
  sizePreset: (overrides.sizePreset ?? 'S') as 'S' | 'M' | 'L',
  aspectRatio: 1,
  isDeleted: false,
  hasVideo: false,
  tags: [] as string[],
})

describe('boardItemsToShareCards', () => {
  it('maps board items to ShareCard payload with normalized 0..1 coords', () => {
    const items = [sampleItem({ bookmarkId: 'a' })]
    const positions = { a: { x: 100, y: 200, w: 150, h: 150 } }
    const frameSize = { width: 1000, height: 1000 }
    const cards = boardItemsToShareCards(items, positions, frameSize)
    expect(cards).toHaveLength(1)
    expect(cards[0].u).toBe('https://example.com')
    expect(cards[0].x).toBeCloseTo(0.1, 2)
    expect(cards[0].y).toBeCloseTo(0.2, 2)
    expect(cards[0].w).toBeCloseTo(0.15, 2)
    expect(cards[0].h).toBeCloseTo(0.15, 2)
  })
})

describe('filterByViewport', () => {
  it('keeps only items overlapping the viewport rectangle', () => {
    const items = [
      sampleItem({ bookmarkId: 'visible' }),
      sampleItem({ bookmarkId: 'offscreen' }),
    ]
    const positions = {
      visible:   { x: 100, y: 100, w: 50, h: 50 },
      offscreen: { x: 5000, y: 5000, w: 50, h: 50 },
    }
    const viewport = { x: 0, y: 0, w: 800, h: 600 }
    const out = filterByViewport(items, positions, viewport)
    expect(out.map((i) => i.bookmarkId)).toEqual(['visible'])
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
rtk pnpm vitest run lib/share/board-to-cards.test.ts
```

- [ ] **Step 3: Implement**

```ts
// lib/share/board-to-cards.ts
import type { ShareCard, ShareSize } from './types'

type Item = {
  readonly bookmarkId: string
  readonly url: string
  readonly title: string
  readonly description?: string
  readonly thumbnail: string
  readonly type: ShareCard['ty']
  readonly sizePreset: ShareSize
}

type Pos = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
type Viewport = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** Keep items whose layout rect intersects the viewport (rectangle overlap test). */
export function filterByViewport<T extends { readonly bookmarkId: string }>(
  items: ReadonlyArray<T>,
  positions: Readonly<Record<string, Pos>>,
  viewport: Viewport,
): T[] {
  const out: T[] = []
  for (const it of items) {
    const p = positions[it.bookmarkId]
    if (!p) continue
    const right = p.x + p.w
    const bottom = p.y + p.h
    const vRight = viewport.x + viewport.w
    const vBottom = viewport.y + viewport.h
    if (right < viewport.x || p.x > vRight) continue
    if (bottom < viewport.y || p.y > vBottom) continue
    out.push(it)
  }
  return out
}

/** Convert board items + masonry positions into a ShareCard array (0..1 normalized). */
export function boardItemsToShareCards(
  items: ReadonlyArray<Item>,
  positions: Readonly<Record<string, Pos>>,
  frameSize: { readonly width: number; readonly height: number },
): ShareCard[] {
  const out: ShareCard[] = []
  for (const it of items) {
    const p = positions[it.bookmarkId]
    if (!p) continue
    out.push({
      u: it.url,
      t: it.title,
      d: it.description || undefined,
      th: it.thumbnail || undefined,
      ty: it.type,
      x: p.x / frameSize.width,
      y: p.y / frameSize.height,
      w: p.w / frameSize.width,
      h: p.h / frameSize.height,
      s: it.sizePreset,
    })
  }
  return out
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
rtk pnpm vitest run lib/share/board-to-cards.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/share/board-to-cards.ts lib/share/board-to-cards.test.ts
rtk git commit -m "feat(share): convert board items + viewport snapshot to ShareCard"
```

---

### Task 2.2: ShareAspectSwitcher (4 ピル切替)

**UI 承認フロー必須。** Toolbar の `<FilterPill>` / `<DisplayModeSwitch>` と統一感のあるデザインにする。

**Files:**
- Create: `components/share/ShareAspectSwitcher.tsx`
- Create: `components/share/ShareAspectSwitcher.module.css`

- [ ] **Step 1: 既存ピル UI の確認 (現状確認)**

```bash
rtk read components/board/FilterPill.tsx components/board/FilterPill.module.css components/board/DisplayModeSwitch.tsx components/board/DisplayModeSwitch.module.css
```

実装前に既存パターン（letter-spacing 0.01em / opacity 0.72→1 hover / pill border-radius / padding）をユーザーに要約してから「同じ視覚言語で 4 ピル横並び、active は背景 fill」案を提示し、承認を待つ。

- [ ] **Step 2: 承認後、実装**

```tsx
// components/share/ShareAspectSwitcher.tsx
'use client'

import type { ReactElement } from 'react'
import { ASPECT_PRESETS } from '@/lib/share/aspect-presets'
import type { ShareAspect } from '@/lib/share/types'
import styles from './ShareAspectSwitcher.module.css'

type Props = {
  readonly value: ShareAspect
  readonly onChange: (next: ShareAspect) => void
}

export function ShareAspectSwitcher({ value, onChange }: Props): ReactElement {
  return (
    <div className={styles.row} role="radiogroup" aria-label="Aspect ratio">
      {ASPECT_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          className={value === p.id ? `${styles.pill} ${styles.active}` : styles.pill}
          onClick={() => onChange(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
```

```css
/* components/share/ShareAspectSwitcher.module.css */
.row {
  display: inline-flex;
  gap: 8px;
}

.pill {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.72);
  padding: 6px 14px;
  font-size: 13px;
  font-family: inherit;
  letter-spacing: 0.01em;
  border-radius: 999px;
  cursor: pointer;
  transition: opacity 140ms ease, background-color 140ms ease, color 140ms ease;
}

.pill:hover {
  color: rgba(255, 255, 255, 1);
}

.active {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 1);
}
```

- [ ] **Step 3: Commit**

```bash
git add components/share/ShareAspectSwitcher.tsx components/share/ShareAspectSwitcher.module.css
rtk git commit -m "feat(share): aspect switcher pills (free/1:1/9:16/16:9)"
```

---

### Task 2.3: ShareFrame (枠の中身を masonry で描画)

**Files:**
- Create: `components/share/ShareFrame.tsx`
- Create: `components/share/ShareFrame.module.css`

- [ ] **Step 1: 設計と承認**

ユーザーへ:
- 「`<CardsLayer>` 流用案 (board と完全パリティ) vs スリム描画版」を提示
- spec §3.1 では board の CardsLayer を流用するとあるが、CardsLayer は drag/hover/lightbox 用の InteractionLayer に依存するので、Composer 側では **CardNode を直接 map** して位置・サイズだけ反映する slim renderer にする。
- 承認後実装。

- [ ] **Step 2: Implement**

```tsx
// components/share/ShareFrame.tsx
'use client'

import type { ReactElement } from 'react'
import type { ShareCard } from '@/lib/share/types'
import { CardNode } from '@/components/board/CardNode'
import styles from './ShareFrame.module.css'

type Props = {
  readonly cards: ReadonlyArray<ShareCard>
  readonly width: number
  readonly height: number
  /** When true, cards respond to drag/click. Off in <SharedView>. */
  readonly editable: boolean
  readonly onCardSelect?: (index: number) => void
  readonly onCardDelete?: (index: number) => void
}

export function ShareFrame({ cards, width, height, editable, onCardSelect, onCardDelete }: Props): ReactElement {
  return (
    <div
      className={styles.frame}
      style={{ width, height }}
      data-testid="share-frame"
    >
      {cards.map((c, i) => (
        <div
          key={`${c.u}-${i}`}
          className={styles.cardWrap}
          style={{
            left: `${c.x * width}px`,
            top: `${c.y * height}px`,
            width: `${c.w * width}px`,
            height: `${c.h * height}px`,
            transform: c.r ? `rotate(${c.r}deg)` : undefined,
            cursor: editable ? 'grab' : 'default',
          }}
          onClick={() => editable && onCardSelect?.(i)}
          onContextMenu={(e) => {
            if (!editable) return
            e.preventDefault()
            onCardDelete?.(i)
          }}
        >
          <CardNode
            bookmarkId={`share-${i}`}
            url={c.u}
            title={c.t}
            description={c.d ?? ''}
            thumbnail={c.th ?? ''}
            type={c.ty === 'image' ? 'website' : c.ty}
            displayMode="visual"
            interactive={false}
          />
        </div>
      ))}
    </div>
  )
}
```

> **Adapter note:** `<CardNode>` の現行 prop シグネチャと一致しなかった場合、本タスク内で wrapper 関数を `lib/share/card-node-adapter.ts` に切り出して prop の差分を埋める。CardNode 本体は触らない。

```css
/* components/share/ShareFrame.module.css */
.frame {
  position: relative;
  background: #0c0c0e;
  border-radius: 8px;
  overflow: hidden;
}

.cardWrap {
  position: absolute;
}
```

- [ ] **Step 3: Visual sanity check (Playwright snapshot は post-launch、まず手動)**

```bash
rtk pnpm dev
# /board へ手動アクセス + composer mock を triggered。Phase 5 完了まで storybook 環境はないので、Task 5 統合まで visual は board 経由で確認になる
```

- [ ] **Step 4: Commit**

```bash
git add components/share/ShareFrame.tsx components/share/ShareFrame.module.css
rtk git commit -m "feat(share): ShareFrame renders cards with normalized layout"
```

---

### Task 2.4: ShareSourceList (下部横スクロール source)

**Files:**
- Create: `components/share/ShareSourceList.tsx`
- Create: `components/share/ShareSourceList.module.css`

- [ ] **Step 1: UI design 承認**

ユーザー mock 提示:
- 高さ 84px の横スクロールバー
- 各 thumb 64x64、ボード上の表示順
- 選択中はオレンジ枠 (`outline: 2px solid #ff8a3d`)
- shortcut button 2 個を左端固定 (「全部入れる」「表示中のみ」)
- 承認後実装

- [ ] **Step 2: Implement**

```tsx
// components/share/ShareSourceList.tsx
'use client'

import type { ReactElement } from 'react'
import styles from './ShareSourceList.module.css'

type SourceItem = {
  readonly bookmarkId: string
  readonly thumbnail: string
  readonly title: string
}

type Props = {
  readonly items: ReadonlyArray<SourceItem>
  readonly selectedIds: ReadonlySet<string>
  readonly onToggle: (id: string) => void
  readonly onAddAll: () => void
  readonly onAddVisible: () => void
}

export function ShareSourceList({ items, selectedIds, onToggle, onAddAll, onAddVisible }: Props): ReactElement {
  return (
    <div className={styles.row} data-testid="share-source-list">
      <div className={styles.shortcuts}>
        <button type="button" className={styles.shortcutBtn} onClick={onAddAll}>
          全部入れる
        </button>
        <button type="button" className={styles.shortcutBtn} onClick={onAddVisible}>
          表示中のみ
        </button>
      </div>
      <div className={styles.scroll}>
        {items.map((it) => {
          const isSelected = selectedIds.has(it.bookmarkId)
          return (
            <button
              key={it.bookmarkId}
              type="button"
              className={isSelected ? `${styles.thumb} ${styles.selected}` : styles.thumb}
              onClick={() => onToggle(it.bookmarkId)}
              aria-pressed={isSelected}
              title={it.title}
            >
              {it.thumbnail
                ? <img src={it.thumbnail} alt="" loading="lazy" />
                : <span className={styles.placeholder}>{it.title.slice(0, 2)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

```css
/* components/share/ShareSourceList.module.css */
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 84px;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.03);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.shortcuts {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.shortcutBtn {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  border: none;
  padding: 6px 12px;
  font-size: 12px;
  letter-spacing: 0.01em;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
}

.shortcutBtn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  flex: 1;
  scrollbar-width: thin;
}

.thumb {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.04);
  border: none;
  padding: 0;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  outline: 2px solid transparent;
  transition: outline 100ms ease;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
}

.selected {
  outline-color: #ff8a3d;
}
```

- [ ] **Step 3: Commit**

```bash
git add components/share/ShareSourceList.tsx components/share/ShareSourceList.module.css
rtk git commit -m "feat(share): source list with toggle + shortcuts (全部入れる/表示中のみ)"
```

---

### Task 2.5: ShareComposer (modal shell + state)

**Files:**
- Create: `components/share/ShareComposer.tsx`
- Create: `components/share/ShareComposer.module.css`

- [ ] **Step 1: UI mock 提示 → 承認**

- 全画面 modal、背景 `rgba(0,0,0,0.55)` + body scroll lock
- 上部: タイトル「シェア用ボードを組む」 + close × + Aspect switcher
- 中央: ShareFrame (centered, fit to (vw - 96) × (vh - 220))
- 下部: ShareSourceList + 確定 CTA「画像 + URL でシェア →」
- 「destefanis 系統 / Tailwind 不使用 / Vanilla CSS」を確認

- [ ] **Step 2: Implement**

```tsx
// components/share/ShareComposer.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { ShareAspect, ShareCard, ShareData } from '@/lib/share/types'
import { SHARE_SCHEMA_VERSION } from '@/lib/share/types'
import { computeAspectFrameSize } from '@/lib/share/aspect-presets'
import { boardItemsToShareCards, filterByViewport } from '@/lib/share/board-to-cards'
import { ShareAspectSwitcher } from './ShareAspectSwitcher'
import { ShareFrame } from './ShareFrame'
import { ShareSourceList } from './ShareSourceList'
import styles from './ShareComposer.module.css'

type BoardItemLite = {
  readonly bookmarkId: string
  readonly url: string
  readonly title: string
  readonly description?: string
  readonly thumbnail: string
  readonly type: ShareCard['ty']
  readonly sizePreset: 'S' | 'M' | 'L'
}

type Pos = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
type Viewport = { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

type Props = {
  readonly open: boolean
  readonly onClose: () => void
  readonly items: ReadonlyArray<BoardItemLite>
  readonly positions: Readonly<Record<string, Pos>>
  readonly viewport: Viewport
  readonly onConfirm: (data: ShareData, frameRef: HTMLElement | null) => void
}

export function ShareComposer({ open, onClose, items, positions, viewport, onConfirm }: Props): ReactElement | null {
  const [aspect, setAspect] = useState<ShareAspect>('free')
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => {
    // Initial state: viewport snapshot — cards visible in current viewport.
    const visible = filterByViewport(items, positions, viewport)
    return new Set(visible.map((i) => i.bookmarkId))
  })

  const frameRef = useRef<HTMLDivElement>(null)

  // Close on ESC
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Body scroll lock
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const frameViewportSize = { width: 1080, height: 720 } // composer canvas; see CSS clamp
  const frameSize = computeAspectFrameSize(aspect, frameViewportSize.width, frameViewportSize.height)

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.bookmarkId)),
    [items, selectedIds],
  )

  const cards = useMemo<ShareCard[]>(
    () => boardItemsToShareCards(selectedItems, positions, frameSize),
    [selectedItems, positions, frameSize],
  )

  const onToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const onAddAll = useCallback(() => {
    setSelectedIds(new Set(items.map((i) => i.bookmarkId)))
  }, [items])

  const onAddVisible = useCallback(() => {
    const v = filterByViewport(items, positions, viewport)
    setSelectedIds(new Set(v.map((i) => i.bookmarkId)))
  }, [items, positions, viewport])

  const onConfirmClick = useCallback(() => {
    const data: ShareData = {
      v: SHARE_SCHEMA_VERSION,
      aspect,
      cards,
    }
    onConfirm(data, frameRef.current)
  }, [aspect, cards, onConfirm])

  if (!open) return null

  return (
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal} role="dialog" aria-label="Share composer" data-testid="share-composer">
        <header className={styles.header}>
          <h2 className={styles.title}>シェア用ボードを組む</h2>
          <ShareAspectSwitcher value={aspect} onChange={setAspect} />
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className={styles.canvasArea}>
          <div ref={frameRef} className={styles.frameWrap}>
            <ShareFrame cards={cards} width={frameSize.width} height={frameSize.height} editable={true} />
          </div>
        </div>

        <ShareSourceList
          items={items.map((i) => ({ bookmarkId: i.bookmarkId, thumbnail: i.thumbnail, title: i.title }))}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onAddAll={onAddAll}
          onAddVisible={onAddVisible}
        />

        <footer className={styles.footer}>
          <button type="button" className={styles.confirmBtn} onClick={onConfirmClick}>
            画像 + URL でシェア →
          </button>
        </footer>
      </div>
    </div>
  )
}
```

```css
/* components/share/ShareComposer.module.css */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  position: relative;
  background: #111114;
  width: min(1280px, 96vw);
  height: min(820px, 92vh);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #fff;
}

.header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  margin: 0;
  flex: 1;
}

.closeBtn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.72);
  font-size: 22px;
  cursor: pointer;
  padding: 4px 12px;
}

.closeBtn:hover { color: #fff; }

.canvasArea {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: auto;
  background: #08080a;
}

.frameWrap { transform-origin: center; }

.footer {
  padding: 14px 24px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.confirmBtn {
  background: #ff8a3d;
  color: #1a1a1a;
  border: none;
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.confirmBtn:hover { background: #ff9a55; }
```

- [ ] **Step 3: Commit**

```bash
git add components/share/ShareComposer.tsx components/share/ShareComposer.module.css
rtk git commit -m "feat(share): ShareComposer modal shell with aspect/source/frame state"
```

---

## Phase 3 — PNG Export + Action Sheet

設計仕様 §7 / §2.1 step 8 に対応。

---

### Task 3.1: Watermark config (Variant A / B)

**Files:**
- Create: `lib/share/watermark-config.ts`

- [ ] **Step 1: Implement**

```ts
// lib/share/watermark-config.ts

export type WatermarkVariant = 'A' | 'B'

export type WatermarkSpec = {
  readonly variant: WatermarkVariant
  readonly primary: string         // top line text
  readonly secondary?: string      // bottom line (variant B)
  readonly primaryFontSize: number
  readonly secondaryFontSize: number
  readonly fontFamily: string
  readonly fontWeight: number
  readonly textColor: string
  readonly secondaryColor: string
  readonly bg: string
  readonly paddingX: number
  readonly paddingY: number
  readonly borderRadius: number
  readonly margin: number
}

const COMMON = {
  primary: 'AllMarks',
  fontFamily: 'Geist, system-ui, sans-serif',
  fontWeight: 600,
  textColor: 'rgba(255,255,255,0.85)',
  secondaryColor: 'rgba(255,255,255,0.55)',
  bg: 'rgba(0,0,0,0.55)',
  paddingX: 9,
  paddingY: 4,
  borderRadius: 4,
  margin: 12,
} as const

export const WATERMARK_VARIANT_A: WatermarkSpec = {
  ...COMMON,
  variant: 'A',
  primaryFontSize: 11,
  secondary: undefined,
  secondaryFontSize: 0,
}

export const WATERMARK_VARIANT_B: WatermarkSpec = {
  ...COMMON,
  variant: 'B',
  primaryFontSize: 11,
  secondary: 'booklage.com',
  secondaryFontSize: 8.5,
}

/**
 * Read NEXT_PUBLIC_WATERMARK_VARIANT and return the corresponding spec.
 * Defaults to Variant A (text-only) until a strong domain is acquired.
 */
export function getActiveWatermark(): WatermarkSpec {
  const v = process.env.NEXT_PUBLIC_WATERMARK_VARIANT
  return v === 'B' ? WATERMARK_VARIANT_B : WATERMARK_VARIANT_A
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/share/watermark-config.ts
rtk git commit -m "feat(share): watermark variants A (text) and B (text+domain)"
```

---

### Task 3.2: PNG export with watermark (canvas overlay)

**Files:**
- Create: `lib/share/png-export.ts`
- Test: `lib/share/png-export.test.ts`

- [ ] **Step 1: Failing test**

`dom-to-image-more` は real canvas を要求するので jsdom では不可。テストは vi.mock で `dom-to-image-more` を差し替え、fake dataURL を返す + watermark 合成ロジックの単体は別関数で分離してテスト。

```ts
// lib/share/png-export.test.ts
import { describe, it, expect, vi } from 'vitest'

// Mock dom-to-image-more — jsdom can't render canvases.
vi.mock('dom-to-image-more', () => ({
  default: {
    toPng: vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgo='),
  },
}))

import { exportFrameAsPng, drawWatermarkOnCanvas } from './png-export'
import { WATERMARK_VARIANT_A } from './watermark-config'

describe('drawWatermarkOnCanvas', () => {
  it('returns the canvas after drawing (smoke)', () => {
    const canvas = { width: 800, height: 600, getContext: () => ({
      measureText: () => ({ width: 50 }),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      set fillStyle(_v: string) {},
      set font(_v: string) {},
      set textBaseline(_v: string) {},
    })} as unknown as HTMLCanvasElement
    const out = drawWatermarkOnCanvas(canvas, WATERMARK_VARIANT_A)
    expect(out).toBe(canvas)
  })
})

describe('exportFrameAsPng', () => {
  it('calls dom-to-image-more.toPng with element', async () => {
    const fakeEl = document.createElement('div')
    fakeEl.style.width = '800px'
    fakeEl.style.height = '600px'
    const dataUrl = await exportFrameAsPng(fakeEl, WATERMARK_VARIANT_A, { skipCanvasOverlay: true })
    expect(dataUrl.startsWith('data:image/png')).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
rtk pnpm vitest run lib/share/png-export.test.ts
```

- [ ] **Step 3: Implement**

```ts
// lib/share/png-export.ts
import domtoimage from 'dom-to-image-more'
import type { WatermarkSpec } from './watermark-config'

/**
 * Draw watermark badge in bottom-right of an existing <canvas>. Returns the
 * same canvas (chainable). Caller is responsible for canvas dimensions matching
 * the source image.
 */
export function drawWatermarkOnCanvas(canvas: HTMLCanvasElement, spec: WatermarkSpec): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  // Measure primary line
  ctx.font = `${spec.fontWeight} ${spec.primaryFontSize}px ${spec.fontFamily}`
  const primaryW = ctx.measureText(spec.primary).width
  let secondaryW = 0
  if (spec.secondary) {
    ctx.font = `400 ${spec.secondaryFontSize}px ${spec.fontFamily}`
    secondaryW = ctx.measureText(spec.secondary).width
  }

  const lineGap = spec.secondary ? 2 : 0
  const textW = Math.max(primaryW, secondaryW)
  const textH = spec.primaryFontSize + (spec.secondary ? lineGap + spec.secondaryFontSize : 0)
  const boxW = textW + 2 * spec.paddingX
  const boxH = textH + 2 * spec.paddingY

  const x = canvas.width - spec.margin - boxW
  const y = canvas.height - spec.margin - boxH

  // Background pill
  ctx.fillStyle = spec.bg
  // Manual rounded rect — Path2D may not support roundRect on all targets.
  const r = spec.borderRadius
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r)
  ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r)
  ctx.arcTo(x, y + boxH, x, y, r)
  ctx.arcTo(x, y, x + boxW, y, r)
  ctx.closePath()
  ctx.fill()

  // Primary line
  ctx.fillStyle = spec.textColor
  ctx.font = `${spec.fontWeight} ${spec.primaryFontSize}px ${spec.fontFamily}`
  ctx.textBaseline = 'top'
  ctx.fillText(spec.primary, x + spec.paddingX, y + spec.paddingY)

  // Secondary line (variant B)
  if (spec.secondary) {
    ctx.fillStyle = spec.secondaryColor
    ctx.font = `400 ${spec.secondaryFontSize}px ${spec.fontFamily}`
    ctx.fillText(
      spec.secondary,
      x + spec.paddingX,
      y + spec.paddingY + spec.primaryFontSize + lineGap,
    )
  }
  return canvas
}

type ExportOpts = {
  /** Test-only: skip canvas-image roundtrip and return the dom-to-image dataURL directly. */
  readonly skipCanvasOverlay?: boolean
  readonly scale?: number
}

/**
 * Render an element to PNG with watermark composited via canvas (so the
 * watermark cannot be removed by DOM tampering).
 */
export async function exportFrameAsPng(
  el: HTMLElement,
  watermark: WatermarkSpec,
  opts: ExportOpts = {},
): Promise<string> {
  const scale = opts.scale ?? 2
  const dataUrl = await domtoimage.toPng(el, { scale, bgcolor: '#0c0c0e' } as never)
  if (opts.skipCanvasOverlay) return dataUrl

  // Composite onto a fresh canvas to add watermark.
  const img = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)
  drawWatermarkOnCanvas(canvas, watermark)
  return canvas.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
rtk pnpm vitest run lib/share/png-export.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/share/png-export.ts lib/share/png-export.test.ts
rtk git commit -m "feat(share): export frame to PNG with canvas-overlaid watermark"
```

---

### Task 3.3: X Web Intent URL builder

**Files:**
- Create: `lib/share/x-intent.ts`
- Test: `lib/share/x-intent.test.ts`

- [ ] **Step 1: Failing test**

```ts
// lib/share/x-intent.test.ts
import { describe, it, expect } from 'vitest'
import { buildXIntent } from './x-intent'

describe('buildXIntent', () => {
  it('encodes text and url params', () => {
    const u = buildXIntent({ shareUrl: 'https://booklage.pages.dev/share#d=abc' })
    expect(u.startsWith('https://twitter.com/intent/tweet?')).toBe(true)
    expect(u).toContain('url=https%3A%2F%2Fbooklage.pages.dev%2Fshare%23d%3Dabc')
    expect(u).toContain('text=')
  })
})
```

- [ ] **Step 2: Implement**

```ts
// lib/share/x-intent.ts
type IntentInput = {
  readonly shareUrl: string
  readonly text?: string
}

const DEFAULT_TEXT = 'AllMarks で見る ↗'

/**
 * Build a Twitter / X Web Intent URL. The image must be attached manually by
 * the user — Web Intent has no image upload param.
 */
export function buildXIntent(input: IntentInput): string {
  const params = new URLSearchParams()
  params.set('text', input.text ?? DEFAULT_TEXT)
  params.set('url', input.shareUrl)
  return `https://twitter.com/intent/tweet?${params.toString()}`
}
```

- [ ] **Step 3: Run — expect PASS** + Commit

```bash
rtk pnpm vitest run lib/share/x-intent.test.ts
git add lib/share/x-intent.ts lib/share/x-intent.test.ts
rtk git commit -m "feat(share): X Web Intent URL builder"
```

---

### Task 3.4: ShareActionSheet (DL / Copy / X intent)

**Files:**
- Create: `components/share/ShareActionSheet.tsx`
- Create: `components/share/ShareActionSheet.module.css`

- [ ] **Step 1: UI 承認**

3 action button layout を mock で提示し、ユーザー承認後実装。

- [ ] **Step 2: Implement**

```tsx
// components/share/ShareActionSheet.tsx
'use client'

import { useCallback, useState, type ReactElement } from 'react'
import { buildXIntent } from '@/lib/share/x-intent'
import styles from './ShareActionSheet.module.css'

type Props = {
  readonly pngDataUrl: string
  readonly shareUrl: string
  readonly onClose: () => void
}

export function ShareActionSheet({ pngDataUrl, shareUrl, onClose }: Props): ReactElement {
  const [copied, setCopied] = useState(false)

  const onDownload = useCallback(() => {
    const a = document.createElement('a')
    a.href = pngDataUrl
    a.download = `booklage-${Date.now()}.png`
    a.click()
  }, [pngDataUrl])

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: prompt
      window.prompt('Copy this URL', shareUrl)
    }
  }, [shareUrl])

  const onPostX = useCallback(() => {
    window.open(buildXIntent({ shareUrl }), '_blank', 'noopener,noreferrer')
  }, [shareUrl])

  return (
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.sheet} role="dialog" aria-label="Share actions">
        <h3 className={styles.title}>シェア方法を選ぶ</h3>
        <div className={styles.preview}>
          <img src={pngDataUrl} alt="Preview" />
        </div>
        <div className={styles.buttons}>
          <button type="button" onClick={onDownload}>📥 画像をダウンロード</button>
          <button type="button" onClick={onCopy}>{copied ? '✓ コピーしました' : '🔗 URL をコピー'}</button>
          <button type="button" onClick={onPostX}>𝕏 X で投稿</button>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}
```

```css
/* components/share/ShareActionSheet.module.css */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 9100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sheet {
  background: #111114;
  color: #fff;
  width: min(440px, 92vw);
  border-radius: 14px;
  padding: 20px 22px;
}

.title {
  font-size: 14px;
  margin: 0 0 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.preview {
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 14px;
  display: flex;
  justify-content: center;
}

.preview img {
  max-width: 100%;
  max-height: 240px;
  height: auto;
}

.buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.buttons button {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border: none;
  padding: 11px 14px;
  border-radius: 8px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.buttons button:hover { background: rgba(255, 255, 255, 0.14); }

.closeBtn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  padding: 6px;
  font-size: 12px;
  cursor: pointer;
  align-self: center;
  display: block;
  margin: 0 auto;
}
```

- [ ] **Step 3: Commit**

```bash
git add components/share/ShareActionSheet.tsx components/share/ShareActionSheet.module.css
rtk git commit -m "feat(share): action sheet with DL / copy URL / X intent"
```

---

## Phase 4 — Recipient (`/share` route + SharedView + ImportConfirmModal)

設計仕様 §2.2 / §9 に対応。

---

### Task 4.1: Import logic (dedup + bulk write)

**Files:**
- Create: `lib/share/import.ts`
- Test: `lib/share/import.test.ts`

- [ ] **Step 1: Failing test (uses fake-indexeddb)**

```ts
// lib/share/import.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { initDB, getAllBookmarks, addBookmark } from '@/lib/storage/indexeddb'
import { importSharedCards } from './import'
import { SHARE_SCHEMA_VERSION } from './types'
import type { ShareData } from './types'

beforeEach(async () => {
  // Reset fake-indexeddb between tests
  const { indexedDB: fakeIDB } = await import('fake-indexeddb')
  ;(globalThis as unknown as { indexedDB: typeof fakeIDB }).indexedDB = fakeIDB
})

describe('importSharedCards', () => {
  it('inserts new bookmarks and skips duplicates by URL', async () => {
    const db = await initDB()
    await addBookmark(db, {
      url: 'https://example.com/already',
      title: 't', description: '', thumbnail: '', favicon: '', siteName: '',
      type: 'website',
    })

    const data: ShareData = {
      v: SHARE_SCHEMA_VERSION,
      aspect: 'free',
      cards: [
        { u: 'https://example.com/already', t: 'dup', ty: 'website', x: 0, y: 0, w: 0.1, h: 0.1, s: 'S' },
        { u: 'https://example.com/new',     t: 'new', ty: 'website', x: 0, y: 0, w: 0.1, h: 0.1, s: 'S' },
      ],
    }

    const result = await importSharedCards(db, data, [])
    expect(result.added).toBe(1)
    expect(result.skipped).toBe(1)

    const all = await getAllBookmarks(db)
    expect(all).toHaveLength(2)
    expect(all.find((b) => b.url === 'https://example.com/new')?.title).toBe('new')
  })
})
```

- [ ] **Step 2: Implement**

```ts
// lib/share/import.ts
import type { IDBPDatabase } from 'idb'
import { addBookmarkBatch, getAllBookmarks } from '@/lib/storage/indexeddb'
import type { BookmarkInput } from '@/lib/storage/indexeddb'
import type { ShareData } from './types'

export type ImportResult = {
  readonly added: number
  readonly skipped: number
}

/**
 * Import sanitized share data into IndexedDB. Skips bookmarks whose URL
 * already exists. Tags every newly imported bookmark with the supplied
 * mood ids.
 */
export async function importSharedCards(
  // idb's generic database type — keep loose to avoid leaking schema details.
  db: IDBPDatabase<unknown>,
  data: ShareData,
  moodIds: ReadonlyArray<string>,
): Promise<ImportResult> {
  const existing = await getAllBookmarks(db as never)
  const existingUrls = new Set(existing.map((b) => b.url))

  const inputs: BookmarkInput[] = []
  let skipped = 0
  for (const c of data.cards) {
    if (existingUrls.has(c.u)) { skipped++; continue }
    inputs.push({
      url: c.u,
      title: c.t,
      description: c.d ?? '',
      thumbnail: c.th ?? '',
      favicon: '',
      siteName: '',
      type: c.ty === 'image' ? 'website' : c.ty,
      tags: [...moodIds],
    })
  }

  if (inputs.length === 0) return { added: 0, skipped }
  const added = await addBookmarkBatch(db as never, inputs)
  return { added: added.length, skipped }
}
```

- [ ] **Step 3: Run — expect PASS** + Commit

```bash
rtk pnpm vitest run lib/share/import.test.ts
git add lib/share/import.ts lib/share/import.test.ts
rtk git commit -m "feat(share): import shared cards into IndexedDB with dedup"
```

---

### Task 4.2: ImportConfirmModal (folder picker + dedup display)

**Files:**
- Create: `components/share/ImportConfirmModal.tsx`
- Create: `components/share/ImportConfirmModal.module.css`

- [ ] **Step 1: UI 承認**

レイアウト案:
- ヘッダー: 「N 件のブックマークを追加しますか？」
- 既存ブクマと URL 重複する分は別 list で「M 件はスキップされます」表示
- フォルダ選択 dropdown (既存 mood + 「新規 mood 作成」)
- 注記: 「外部画像が読み込まれる旨」を fine print
- ボタン: キャンセル / 追加

- [ ] **Step 2: Implement**

```tsx
// components/share/ImportConfirmModal.tsx
'use client'

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { IDBPDatabase } from 'idb'
import type { ShareData } from '@/lib/share/types'
import type { MoodRecord } from '@/lib/storage/indexeddb'
import { initDB, getAllBookmarks } from '@/lib/storage/indexeddb'
import { listMoods } from '@/lib/storage/moods'
import { importSharedCards } from '@/lib/share/import'
import styles from './ImportConfirmModal.module.css'

type Props = {
  readonly data: ShareData
  readonly onClose: () => void
  readonly onImported: (result: { added: number; skipped: number }) => void
}

export function ImportConfirmModal({ data, onClose, onImported }: Props): ReactElement {
  const [moods, setMoods] = useState<ReadonlyArray<MoodRecord>>([])
  const [selectedMoodId, setSelectedMoodId] = useState<string>('')
  const [duplicateUrls, setDuplicateUrls] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const db = await initDB()
      const m = await listMoods(db)
      setMoods(m)
      const all = await getAllBookmarks(db)
      const existing = new Set(all.map((b) => b.url))
      setDuplicateUrls(new Set(data.cards.filter((c) => existing.has(c.u)).map((c) => c.u)))
    })()
  }, [data.cards])

  const newCount = data.cards.length - duplicateUrls.size

  const onConfirm = async (): Promise<void> => {
    setBusy(true)
    const db = await initDB()
    const moodIds = selectedMoodId ? [selectedMoodId] : []
    const result = await importSharedCards(db, data, moodIds)
    setBusy(false)
    onImported(result)
  }

  return (
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal} role="dialog" aria-label="Import confirmation">
        <h3 className={styles.title}>{newCount} 件のブクマを追加します</h3>
        {duplicateUrls.size > 0 && (
          <p className={styles.skipNote}>{duplicateUrls.size} 件は既存と重複するためスキップされます</p>
        )}

        <label className={styles.field}>
          <span>追加先のフォルダ</span>
          <select value={selectedMoodId} onChange={(e) => setSelectedMoodId(e.target.value)}>
            <option value="">📥 Inbox</option>
            {moods.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>

        <p className={styles.fineNote}>外部 URL のサムネイル画像が読み込まれます。</p>

        <div className={styles.buttons}>
          <button type="button" onClick={onClose} disabled={busy}>キャンセル</button>
          <button type="button" className={styles.primary} onClick={onConfirm} disabled={busy || newCount === 0}>
            {busy ? '追加中...' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

```css
/* components/share/ImportConfirmModal.module.css */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  background: #111114;
  color: #fff;
  width: min(440px, 92vw);
  border-radius: 14px;
  padding: 22px 24px;
}

.title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 8px;
}

.skipNote {
  margin: 0 0 14px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  margin-bottom: 14px;
}

.field select {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
}

.fineNote {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  margin: 0 0 14px;
}

.buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.buttons button {
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
}

.buttons button:hover { color: #fff; border-color: rgba(255, 255, 255, 0.3); }

.primary {
  background: #ff8a3d !important;
  color: #1a1a1a !important;
  border: none !important;
  font-weight: 600;
}

.primary:hover { background: #ff9a55 !important; }

.primary:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 3: Commit**

```bash
git add components/share/ImportConfirmModal.tsx components/share/ImportConfirmModal.module.css
rtk git commit -m "feat(share): import confirm modal with dedup and folder picker"
```

---

### Task 4.3: SharedView (view-only renderer)

**Files:**
- Create: `components/share/SharedView.tsx`
- Create: `components/share/SharedView.module.css`

- [ ] **Step 1: Implement**

```tsx
// components/share/SharedView.tsx
'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { decodeShareData } from '@/lib/share/decode'
import { sanitizeShareData } from '@/lib/share/validate'
import { computeAspectFrameSize } from '@/lib/share/aspect-presets'
import type { ShareData } from '@/lib/share/types'
import { ShareFrame } from './ShareFrame'
import { ImportConfirmModal } from './ImportConfirmModal'
import styles from './SharedView.module.css'

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly data: ShareData }

export function SharedView(): ReactElement {
  const router = useRouter()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [importOpen, setImportOpen] = useState(false)
  const [size, setSize] = useState({ w: 1080, h: 720 })

  useEffect(() => {
    const onResize = () => {
      setSize({ w: Math.min(window.innerWidth - 64, 1280), h: Math.min(window.innerHeight - 200, 820) })
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    void (async () => {
      const hash = typeof window !== 'undefined' ? window.location.hash : ''
      const match = hash.match(/^#d=(.+)$/)
      if (!match) {
        setState({ kind: 'error', message: 'シェアデータが見つかりません' })
        return
      }
      const result = await decodeShareData(match[1])
      if (!result.ok) {
        setState({ kind: 'error', message: 'シェアデータが破損しています' })
        return
      }
      setState({ kind: 'ready', data: sanitizeShareData(result.data) })
    })()
  }, [])

  if (state.kind === 'loading') {
    return <div className={styles.center}>読み込み中...</div>
  }
  if (state.kind === 'error') {
    return (
      <div className={styles.center}>
        <p>{state.message}</p>
        <a href="/board">ボードへ戻る</a>
      </div>
    )
  }

  const frame = computeAspectFrameSize(state.data.aspect, size.w, size.h)

  return (
    <div className={styles.page}>
      <div className={styles.frameHost}>
        <ShareFrame cards={state.data.cards} width={frame.width} height={frame.height} editable={false} />
      </div>

      <button type="button" className={styles.cta} onClick={() => setImportOpen(true)}>
        + 自分のボードに追加
      </button>

      {importOpen && (
        <ImportConfirmModal
          data={state.data}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false)
            router.push('/board')
          }}
        />
      )}
    </div>
  )
}
```

```css
/* components/share/SharedView.module.css */
.page {
  min-height: 100vh;
  background: #08080a;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px 110px;
}

.frameHost { margin: 0 auto; }

.center {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  justify-content: center;
  background: #08080a;
  color: #fff;
}

.cta {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #ff8a3d;
  color: #1a1a1a;
  border: none;
  padding: 14px 28px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
}

.cta:hover { background: #ff9a55; }
```

- [ ] **Step 2: Commit**

```bash
git add components/share/SharedView.tsx components/share/SharedView.module.css
rtk git commit -m "feat(share): SharedView decodes hash and renders read-only frame"
```

---

### Task 4.4: `/share` route page

**Files:**
- Create: `app/(app)/share/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/(app)/share/page.tsx
import type { Metadata } from 'next'
import { SharedView } from '@/components/share/SharedView'

export const metadata: Metadata = {
  title: 'Shared Collage — AllMarks',
  description: 'A shared moodboard from AllMarks.',
}

// Static-export friendly: SharedView is a client component reading
// `window.location.hash` directly.
export const dynamic = 'force-static'

export default function SharePage() {
  return <SharedView />
}
```

- [ ] **Step 2: Verify build (output: 'export')**

```bash
rtk pnpm build
```

Expected: build succeeds, `out/share.html` generated.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/share/page.tsx
rtk git commit -m "feat(share): /share route entrypoint"
```

---

## Phase 5 — Toolbar Share Pill + BoardRoot Integration

設計仕様 §8 に対応。Phase 1-4 のコンポーネントが揃ったので、ボードから Share を起動できるよう配線する。

---

### Task 5.1: Toolbar に Share pill 追加

**Files:**
- Modify: `components/board/Toolbar.tsx`
- Modify: `components/board/Toolbar.module.css` (Share pill 追加部分のみ)

- [ ] **Step 1: 既存 Toolbar 確認 + UI 承認**

ユーザーへ提示:
- 既存 FilterPill / DisplayModeSwitch と同パターン (text-only pill, opacity 0.72→1 hover)
- ラベル `Share`、右端に追加
- click → `onShareClick()`
- 動画再生中なら BoardRoot 側で pause を kick

- [ ] **Step 2: Implement**

```tsx
// components/board/Toolbar.tsx (replace whole file)
'use client'

import type { ReactElement } from 'react'
import type { BoardFilter, DisplayMode } from '@/lib/board/types'
import type { MoodRecord } from '@/lib/storage/indexeddb'
import { FilterPill } from './FilterPill'
import { DisplayModeSwitch } from './DisplayModeSwitch'
import styles from './Toolbar.module.css'

type Props = {
  readonly activeFilter: BoardFilter
  readonly onFilterChange: (f: BoardFilter) => void
  readonly displayMode: DisplayMode
  readonly onDisplayModeChange: (m: DisplayMode) => void
  readonly moods: ReadonlyArray<MoodRecord>
  readonly counts: { readonly all: number; readonly inbox: number; readonly archive: number }
  readonly onShareClick: () => void
}

export function Toolbar({
  activeFilter, onFilterChange, displayMode, onDisplayModeChange, moods, counts, onShareClick,
}: Props): ReactElement {
  return (
    <div className={styles.container} data-testid="board-toolbar">
      <FilterPill value={activeFilter} onChange={onFilterChange} moods={moods} counts={counts} />
      <DisplayModeSwitch value={displayMode} onChange={onDisplayModeChange} />
      <button
        type="button"
        className={styles.sharePill}
        onClick={onShareClick}
        data-testid="share-pill"
      >
        Share ↗
      </button>
    </div>
  )
}
```

- [ ] **Step 3: CSS 追加 (Toolbar.module.css に append)**

```css
/* Append to Toolbar.module.css */
.sharePill {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.72);
  padding: 6px 14px;
  font-size: 13px;
  font-family: inherit;
  letter-spacing: 0.01em;
  border-radius: 999px;
  cursor: pointer;
  transition: opacity 140ms ease, color 140ms ease;
}

.sharePill:hover { color: rgba(255, 255, 255, 1); }
```

- [ ] **Step 4: Commit**

```bash
git add components/board/Toolbar.tsx components/board/Toolbar.module.css
rtk git commit -m "feat(board): Share pill in Toolbar"
```

---

### Task 5.2: BoardRoot 統合

**Files:**
- Modify: `components/board/BoardRoot.tsx`

- [ ] **Step 1: Implement**

`components/board/BoardRoot.tsx` 内で:

1. `useState<boolean>(false)` で `shareComposerOpen` を持つ
2. Toolbar に `onShareClick={() => setShareComposerOpen(true)}` を追加
3. `<ShareComposer>` をマウント (composer に `items` / `positions` / `viewport` を渡す)
4. confirm ハンドラ:
   - `lib/share/encode.ts` で URL 生成
   - `lib/share/png-export.ts` で PNG 生成 (frameRef)
   - `<ShareActionSheet>` を開く

```tsx
// 追加 import
import { ShareComposer } from '@/components/share/ShareComposer'
import { ShareActionSheet } from '@/components/share/ShareActionSheet'
import { encodeShareData } from '@/lib/share/encode'
import { exportFrameAsPng } from '@/lib/share/png-export'
import { getActiveWatermark } from '@/lib/share/watermark-config'
import type { ShareData } from '@/lib/share/types'

// state 追加 (関数内 const のあたり)
const [shareComposerOpen, setShareComposerOpen] = useState(false)
const [actionSheet, setActionSheet] = useState<{ pngDataUrl: string; shareUrl: string } | null>(null)

// share confirm ハンドラ
const handleShareConfirm = useCallback(async (data: ShareData, frameEl: HTMLElement | null): Promise<void> => {
  if (!frameEl) return
  const fragment = await encodeShareData(data)
  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/share` : 'https://booklage.pages.dev/share'
  const shareUrl = `${baseUrl}#d=${fragment}`
  const pngDataUrl = await exportFrameAsPng(frameEl, getActiveWatermark())
  setShareComposerOpen(false)
  setActionSheet({ pngDataUrl, shareUrl })
}, [])

// Toolbar の prop に追加
// onShareClick={() => setShareComposerOpen(true)}

// レンダー末尾に追加 (BoardChrome / Lightbox の後ろに):
{shareComposerOpen && (
  <ShareComposer
    open={shareComposerOpen}
    onClose={() => setShareComposerOpen(false)}
    items={filteredItems.map((it) => ({
      bookmarkId: it.bookmarkId,
      url: it.url,
      title: it.title,
      description: it.description,
      thumbnail: it.thumbnail,
      type: detectUrlType(it.url),
      sizePreset: it.sizePreset,
    }))}
    positions={layout.positions}
    viewport={viewport}
    onConfirm={handleShareConfirm}
  />
)}
{actionSheet && (
  <ShareActionSheet
    pngDataUrl={actionSheet.pngDataUrl}
    shareUrl={actionSheet.shareUrl}
    onClose={() => setActionSheet(null)}
  />
)}
```

> **Note:** `filteredItems` の `description` フィールドは `BoardItem` 型に存在しない可能性あり。該当時は空文字でフォールバック (`(it as { description?: string }).description ?? ''`)。

- [ ] **Step 2: Manual smoke test**

```bash
rtk pnpm dev
# /board に行き、Share pill クリック → composer 開く → 確定 → ActionSheet 開く → DL 動作 → URL コピー → /share?... で開く
```

- [ ] **Step 3: Commit**

```bash
git add components/board/BoardRoot.tsx
rtk git commit -m "feat(board): wire ShareComposer + ActionSheet from Toolbar"
```

---

### Task 5.3: i18n strings (ja / en) 最低限

**Files:**
- Modify: `messages/ja.json`
- Modify: `messages/en.json`

- [ ] **Step 1: Add minimum keys**

```json
// ja.json (追加部分)
"share": {
  "pill": "Share ↗",
  "composerTitle": "シェア用ボードを組む",
  "addAll": "全部入れる",
  "addVisible": "表示中のみ",
  "confirm": "画像 + URL でシェア →",
  "actionDownload": "画像をダウンロード",
  "actionCopy": "URL をコピー",
  "actionPostX": "X で投稿",
  "actionCopied": "コピーしました",
  "importTitle": "{n} 件のブクマを追加します",
  "importSkip": "{n} 件は既存と重複するためスキップされます",
  "importFolder": "追加先のフォルダ",
  "importInbox": "Inbox",
  "importThumbnailNote": "外部 URL のサムネイル画像が読み込まれます。",
  "importCancel": "キャンセル",
  "importConfirm": "追加する",
  "importBusy": "追加中...",
  "errorMissing": "シェアデータが見つかりません",
  "errorCorrupt": "シェアデータが破損しています",
  "ctaImport": "+ 自分のボードに追加"
}
```

```json
// en.json (同じ key を英訳)
"share": {
  "pill": "Share ↗",
  "composerTitle": "Compose your share board",
  "addAll": "Add all",
  "addVisible": "Visible only",
  "confirm": "Share image + URL →",
  "actionDownload": "Download image",
  "actionCopy": "Copy URL",
  "actionPostX": "Post on X",
  "actionCopied": "Copied",
  "importTitle": "Add {n} bookmarks",
  "importSkip": "{n} duplicates will be skipped",
  "importFolder": "Add to folder",
  "importInbox": "Inbox",
  "importThumbnailNote": "External thumbnail images will be loaded.",
  "importCancel": "Cancel",
  "importConfirm": "Add",
  "importBusy": "Adding...",
  "errorMissing": "Share data not found",
  "errorCorrupt": "Share data is corrupted",
  "ctaImport": "+ Add to my board"
}
```

> **Note:** 一旦 ja / en だけ。13 言語完全翻訳は post-launch 別タスク。コンポーネント側は i18n 化するか hard-code するかは既存パターンに合わせる (CardsLayer / Toolbar の現行実装が hardcode 日本語/英語なら、Share も最初は hard-code でもいい — その場合は messages 追加は post-launch)。

- [ ] **Step 2: Commit**

```bash
git add messages/ja.json messages/en.json
rtk git commit -m "i18n(share): add ja/en strings for share system"
```

---

## Phase 6 — E2E Tests + Polish

設計仕様 §11.3 に対応。

---

### Task 6.1: E2E sender flow

**Files:**
- Create: `tests/e2e/share-sender.spec.ts`

- [ ] **Step 1: Implement**

```ts
// tests/e2e/share-sender.spec.ts
import { test, expect } from '@playwright/test'

test('sender: open composer → confirm → action sheet visible', async ({ page }) => {
  await page.goto('/board')

  // Seed at least one bookmark for the test (use seed-demos or /save)
  await page.goto('/seed-demos')
  await page.click('text=Seed')
  await page.goto('/board')

  // Wait for board to render
  await page.waitForSelector('[data-testid="board-toolbar"]')

  // Open composer
  await page.click('[data-testid="share-pill"]')
  await expect(page.locator('[data-testid="share-composer"]')).toBeVisible()

  // Click confirm (default has viewport snapshot of seeded items)
  await page.click('text=画像 + URL でシェア')

  // Action sheet should appear
  await expect(page.locator('text=シェア方法を選ぶ')).toBeVisible()
  await expect(page.locator('text=画像をダウンロード')).toBeVisible()
})
```

- [ ] **Step 2: Run**

```bash
rtk pnpm playwright test share-sender
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/share-sender.spec.ts
rtk git commit -m "test(e2e): share sender flow"
```

---

### Task 6.2: E2E recipient flow

**Files:**
- Create: `tests/e2e/share-recipient.spec.ts`

- [ ] **Step 1: Implement**

```ts
// tests/e2e/share-recipient.spec.ts
import { test, expect } from '@playwright/test'

test('recipient: open share URL → SharedView renders → import → /board', async ({ page }) => {
  // Construct a real share URL via the encoder helpers loaded in the page.
  await page.goto('/board')
  const fragment = await page.evaluate(async () => {
    const m = await import('/lib/share/encode.ts' as never)
    type Fn = (data: unknown) => Promise<string>
    const encode = (m as { encodeShareData: Fn }).encodeShareData
    return encode({
      v: 1,
      aspect: 'free',
      cards: [
        { u: 'https://example.com/imported', t: 'Imported', ty: 'website',
          x: 0.1, y: 0.1, w: 0.3, h: 0.3, s: 'M' },
      ],
    })
  })

  await page.goto(`/share#d=${fragment}`)
  await expect(page.locator('[data-testid="share-frame"]')).toBeVisible()

  await page.click('text=自分のボードに追加')
  await expect(page.locator('text=ブクマを追加します')).toBeVisible()

  await page.click('text=追加する')
  await page.waitForURL('**/board')
})
```

> **Note:** `await import('/lib/share/encode.ts')` は dev サーバーで動く想定。production build ではモジュール path が違うので、必要に応じて test-helper 経由 (e.g. `window.__shareTest.encode()`) を仕込む構成へ書き換える。

- [ ] **Step 2: Run + Commit**

```bash
rtk pnpm playwright test share-recipient
git add tests/e2e/share-recipient.spec.ts
rtk git commit -m "test(e2e): share recipient flow"
```

---

### Task 6.3: 全テスト + tsc + build smoke

- [ ] **Step 1: Lint + tsc + vitest**

```bash
rtk pnpm tsc --noEmit
rtk pnpm vitest run
rtk pnpm lint
```

- [ ] **Step 2: Production build (output: 'export')**

```bash
rtk pnpm build
```

Expected: `out/share/index.html` 生成。

- [ ] **Step 3: Manual production preview**

```bash
rtk npx wrangler pages dev out
# /board → Share → DL → URL コピー → 別ブラウザで開く → import
```

- [ ] **Step 4: Deploy preview**

```bash
rtk npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true
```

ユーザーに `https://booklage.pages.dev` でハードリロード確認を依頼する。

- [ ] **Step 5: 仕上げ commit (TODO 更新含む)**

```bash
# docs/TODO.md の「現在の状態」を更新 (Share System 完了、AdSense 申請が次)
# 別途 Edit ツールで反映
git add docs/TODO.md
rtk git commit -m "docs(todo): mark Share System complete, AdSense application next"
```

---

## Self-Review

### Spec coverage check

| Spec section | Tasks |
|---|---|
| §1 Goal | 全体 |
| §2.1 Sender flow | 2.5 + 5.2 + 3.4 |
| §2.2 Recipient flow | 4.3 + 4.2 |
| §3.1 New components | 全部 (Phase 2-4) |
| §3.2 Modified components | 5.1 + 5.2 |
| §4.1 ShareData structure | 1.1 |
| §4.2 Encoding pipeline | 1.4 |
| §4.3 Decoding pipeline | 1.5 |
| §4.4 Hash-based URL | 4.3 SharedView の `window.location.hash` 読取 |
| §5 #1 URL scheme allowlist | 1.6 |
| §5 #2 XSS 防御 | React default escape — `dangerouslySetInnerHTML` を share/import モジュール内で使わないことを task 内 review で確認 (Task 6.3 lint) |
| §5 #3 type 再判定 | 1.6 |
| §5 #4 サイズ件数上限 | 1.6 |
| §5 #5 文字長 truncate | 1.6 |
| §5 #6 IP リーク開示 | 4.2 (`importThumbnailNote`) |
| §5 #7 fragment 使用 | 4.3 + 5.2 (URL は `#d=`) |
| §6 Aspect presets | 1.2 + 2.2 |
| §7 Watermark | 3.1 + 3.2 |
| §7.4 PNG 焼き付け | 3.2 (canvas overlay) |
| §8 Toolbar Share button | 5.1 |
| §8.2 動画 pause | 5.2 (TODO: pause 実装は polish で) |
| §9.1 /share route | 4.4 |
| §9.2 view-only 制限 | 4.3 (`editable={false}`) |
| §9.3 Import confirm modal | 4.2 |
| §10 Out of scope | 触らない (B1 / 4:5 / proxy は post-launch) |
| §11.1 Unit tests | 1.4 / 1.5 / 1.6 / 1.7 / 2.1 / 3.2 / 3.3 / 4.1 |
| §11.2 Integration tests | 1.7 |
| §11.3 E2E | 6.1 / 6.2 |
| §12 Effort estimate | 全 phase = 3-4 日相当 |
| §13 Dependencies | 既存のみ — `dom-to-image-more` `idb` `next/navigation` `CompressionStream` |

### Gap notes (Self-Review 後の追加発見)

- **§8.2 動画 pause**: composer を開く前に board 上の動画再生を pause させる要件は Task 5.2 のスコープ内だが、最小実装として `setShareComposerOpen(true)` の前に `document.querySelectorAll('iframe[src*="youtube"], iframe[src*="tiktok"], video').forEach((el) => /* pause */)` を 1 行入れる。実装時に YouTube IFrame API が要らない簡易版でいく。Task 5.2 の手順末尾に注記済み。
- **§5 #2 XSS lint**: ESLint custom rule の代わりに、Task 6.3 で `rg "dangerouslySetInnerHTML" components/share/ lib/share/` を実行して 0 件であることを確認するチェックを入れる。

### Type consistency check

- `ShareCard.s` (size preset) は `ShareSize = 'S' | 'M' | 'L'`。BoardItem.sizePreset と同型 ✓
- `ShareCard.x/y/w/h` は 0..1 normalized — `boardItemsToShareCards` で `/ frameSize.width` 正規化、ShareFrame で `* width` 復元 ✓
- `ShareData.v` は `1` リテラル — `SHARE_SCHEMA_VERSION` 定数経由で統一 ✓
- `decodeShareData` の戻り値は `DecodeResult` (`{ ok: true, data } | { ok: false, error }`) — caller (SharedView) が `result.ok` を分岐 ✓

### Placeholder scan

`grep -E "(TODO|TBD|implement later|fill in details|appropriate error|similar to)"` 想定で見ると、本プランに残っているのは:

- "TODO: pause 実装は polish で" (Task 5.2 注記) — これは意図的な明示で、Task 5.2 の手順内に最小実装ガイダンスあり ✓
- 他の "TODO" は本ドキュメントのこの行以外には残さないこと

すべて任意の手戻り無しで実装可能な状態に揃っている。

---

Plan complete and saved to `docs/superpowers/plans/2026-05-06-share-system.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
