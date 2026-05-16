# S3 デザイン磨き — 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** リキッドグラス、4種カードスタイル、リッチインタラクション、テーマ連動を実装し、AllMarksを「触って楽しい表現ツール」に引き上げる。

**Architecture:** B案（見た目インパクト先行）。まずリキッドグラス＋インタラクションを既存Glassカード上で動かし、次にカードサイズシステム、カードスタイル4種、テーマ連動、設定パネルの順で積み上げる。全てVanilla CSS + GSAP（Framer Motion禁止）。

**Tech Stack:** Next.js 14 App Router, TypeScript strict, GSAP + Draggable, CSS Modules, IndexedDB (idb), Canvas 2D (displacement map生成), SVG Filters (feDisplacementMap)

**Spec:** `docs/superpowers/specs/2026-04-14-s3-design-polish.md`

---

## ファイル構成

### 新規作成

| ファイル | 責務 |
|---------|------|
| `lib/glass/displacement-map.ts` | Canvas 2Dでdisplacement map画像を生成 |
| `lib/glass/LiquidGlassProvider.tsx` | SVGフィルター定義 + @supports検出コンテキスト |
| `lib/glass/use-liquid-glass.ts` | 要素にリキッドグラスを適用するhook |
| `lib/interactions/use-card-tilt.ts` | 3D tilt + spotlight のhook |
| `lib/interactions/use-card-repulsion.ts` | ドラッグ中の距離ベースリパルション |
| `lib/interactions/use-frame-monitor.ts` | FPS監視 + 自動段階的劣化 |
| `lib/interactions/ripple.ts` | 着地波紋エフェクトのユーティリティ |
| `lib/theme/theme-utils.ts` | テーマ→カラーモードマッピング、輝度計算 |
| `lib/theme/use-preferences.ts` | UserPreferences管理hook |
| `lib/canvas/card-sizing.ts` | ランダムサイズ/アスペクト比生成 |
| `components/board/card-styles/CardStyleWrapper.tsx` | カードスタイル別ラッパー |
| `components/board/card-styles/CardStyleWrapper.module.css` | 全4スタイルのCSS |
| `components/board/ResizeHandle.tsx` | カードリサイズハンドル |
| `components/board/ResizeHandle.module.css` | リサイズハンドルのスタイル |
| `components/board/SettingsPanel.tsx` | 統合設定パネル（ThemeSelector拡張） |
| `components/board/SettingsPanel.module.css` | 設定パネルのスタイル |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `lib/constants.ts` | カードサイズ/比率プリセット、DB_VERSION=3 |
| `lib/storage/indexeddb.ts` | CardRecordにwidth/height追加、UserPreferences store、v3 migration |
| `app/globals.css` | cardboardテーマ、glass透過値更新、リキッドグラスCSS、波紋keyframes |
| `app/layout.tsx` | data-ui-theme属性、手書き風フォント追加 |
| `components/board/BookmarkCard.tsx` | 可変サイズ対応 |
| `components/board/BookmarkCard.module.css` | 固定240px幅を削除、CSS変数化 |
| `components/board/TweetCard.tsx` | 可変サイズ対応（必要に応じて） |
| `components/board/DraggableCard.tsx` | tilt/spotlight/ripple統合 |
| `components/board/DraggableCard.module.css` | tilt/spotlight/rippleスタイル |
| `components/board/Canvas.tsx` | LiquidGlassProvider wrapper |
| `components/board/FolderNav.module.css` | リキッドグラス適用 |
| `components/board/UrlInput.module.css` | リキッドグラス適用 |
| `components/board/ViewModeToggle.module.css` | リキッドグラス適用 |
| `components/board/ExportButton.module.css` | リキッドグラス適用 |
| `components/board/RandomPick.module.css` | リキッドグラス適用 |
| `app/(app)/board/board-client.tsx` | 全システム統合 |

---

## Task 1: Displacement Map生成

**Files:**
- Create: `lib/glass/displacement-map.ts`

- [ ] **Step 1: displacement-map.ts を作成**

Canvas 2Dで角丸矩形の屈折displacement mapを生成する純粋関数。
SVGの `feDisplacementMap` は R=x方向、G=y方向の変位として解釈する。
128がニュートラル（変位なし）、0-127が負方向、129-255が正方向。

```typescript
// lib/glass/displacement-map.ts

/**
 * Generate a displacement map for liquid glass refraction effect.
 *
 * The map encodes per-pixel displacement vectors as RGB colors:
 * - R channel: horizontal displacement (128 = no displacement)
 * - G channel: vertical displacement (128 = no displacement)
 * - B channel: unused (set to 128)
 *
 * Edge pixels get strong inward displacement (simulating glass curvature).
 * Center pixels get zero displacement.
 */

/** Strength presets for different UI elements */
export type GlassStrength = 'subtle' | 'medium' | 'strong'

const STRENGTH_SCALE: Record<GlassStrength, number> = {
  subtle: 8,
  medium: 16,
  strong: 24,
}

/**
 * Generate a displacement map as a data URL for the given dimensions.
 *
 * @param width - Element width in pixels
 * @param height - Element height in pixels
 * @param borderRadius - Corner radius in pixels
 * @param strength - Refraction intensity preset
 * @returns data URL of the displacement map PNG
 */
export function generateDisplacementMap(
  width: number,
  height: number,
  borderRadius: number,
  strength: GlassStrength = 'medium',
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const imageData = ctx.createImageData(width, height)
  const data = imageData.data
  const maxDisplacement = STRENGTH_SCALE[strength]

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4

      // Distance from each edge
      const distLeft = x
      const distRight = width - 1 - x
      const distTop = y
      const distBottom = height - 1 - y

      // Minimum distance to any edge
      const distX = Math.min(distLeft, distRight)
      const distY = Math.min(distTop, distBottom)

      // Normalized edge proximity (0 = at edge, 1 = far from edge)
      const edgeFalloff = 30 // pixels over which the effect fades
      const normalizedX = Math.min(distX / edgeFalloff, 1)
      const normalizedY = Math.min(distY / edgeFalloff, 1)

      // Smooth falloff using cubic ease
      const falloffX = 1 - normalizedX * normalizedX * (3 - 2 * normalizedX)
      const falloffY = 1 - normalizedY * normalizedY * (3 - 2 * normalizedY)

      // Displacement direction: push inward from edges
      const dirX = distLeft < distRight ? 1 : -1
      const dirY = distTop < distBottom ? 1 : -1

      // Compute displacement magnitude
      const dx = dirX * falloffX * maxDisplacement
      const dy = dirY * falloffY * maxDisplacement

      // Handle rounded corners — reduce displacement in corner regions
      const inCorner = distX < borderRadius && distY < borderRadius
      let cornerScale = 1
      if (inCorner) {
        const cornerDist = Math.sqrt(
          (borderRadius - distX) ** 2 + (borderRadius - distY) ** 2,
        )
        cornerScale = Math.min(cornerDist / borderRadius, 1)
      }

      // Encode as color: 128 = neutral, ±127 = max displacement
      data[idx] = Math.round(128 + dx * cornerScale) // R = x displacement
      data[idx + 1] = Math.round(128 + dy * cornerScale) // G = y displacement
      data[idx + 2] = 128 // B = unused
      data[idx + 3] = 255 // A = full opacity
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Cache for generated displacement maps, keyed by "WxH-radius-strength" */
const mapCache = new Map<string, string>()

/**
 * Get a displacement map, using cache if available.
 */
export function getDisplacementMap(
  width: number,
  height: number,
  borderRadius: number,
  strength: GlassStrength = 'medium',
): string {
  const key = `${width}x${height}-${borderRadius}-${strength}`
  const cached = mapCache.get(key)
  if (cached) return cached

  const dataUrl = generateDisplacementMap(width, height, borderRadius, strength)
  mapCache.set(key, dataUrl)
  return dataUrl
}
```

- [ ] **Step 2: ビルド確認**

Run: `npx next build 2>&1 | head -20` (or `rtk next build`)
Expected: ビルドエラーなし（まだどこからもimportされていないが、型エラーがないことを確認）

- [ ] **Step 3: コミット**

```bash
git add lib/glass/displacement-map.ts
git commit -m "feat(glass): add displacement map generator for liquid glass effect"
```

---

## Task 2: LiquidGlassProvider

**Files:**
- Create: `lib/glass/LiquidGlassProvider.tsx`

- [ ] **Step 1: LiquidGlassProvider.tsx を作成**

SVGフィルターをDOMに配置し、ブラウザのサポート状態をコンテキストで配信する。

```tsx
// lib/glass/LiquidGlassProvider.tsx
'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getDisplacementMap, type GlassStrength } from './displacement-map'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type LiquidGlassContextValue = {
  /** Whether the browser supports SVG backdrop-filter (Chrome only as of 2026) */
  supportsLiquidGlass: boolean
  /** Register a filter for given dimensions; returns the filter ID */
  registerFilter: (
    id: string,
    width: number,
    height: number,
    borderRadius: number,
    strength?: GlassStrength,
  ) => string
}

const LiquidGlassContext = createContext<LiquidGlassContextValue>({
  supportsLiquidGlass: false,
  registerFilter: () => '',
})

export function useLiquidGlassContext(): LiquidGlassContextValue {
  return useContext(LiquidGlassContext)
}

// ---------------------------------------------------------------------------
// Support detection
// ---------------------------------------------------------------------------

/**
 * Detect if the browser supports SVG filters in backdrop-filter.
 * Currently only Chrome/Chromium-based browsers support this.
 */
function detectSvgBackdropFilterSupport(): boolean {
  if (typeof window === 'undefined') return false

  // Feature detection: create a test element with SVG backdrop-filter
  const testEl = document.createElement('div')
  testEl.style.cssText = 'backdrop-filter: url(#test); -webkit-backdrop-filter: url(#test);'
  document.body.appendChild(testEl)
  const computed = getComputedStyle(testEl).backdropFilter
    || getComputedStyle(testEl).webkitBackdropFilter
  document.body.removeChild(testEl)

  // Chrome returns the url() value; Safari/Firefox return 'none' or ''
  const supported = typeof computed === 'string' && computed.includes('url(')

  return supported
}

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

type LiquidGlassProviderProps = {
  children: React.ReactNode
}

type FilterEntry = {
  id: string
  width: number
  height: number
  borderRadius: number
  strength: GlassStrength
  dataUrl: string
}

export function LiquidGlassProvider({ children }: LiquidGlassProviderProps): React.ReactElement {
  const [supported, setSupported] = useState(false)
  const filtersRef = useRef<Map<string, FilterEntry>>(new Map())
  const [filters, setFilters] = useState<FilterEntry[]>([])

  useEffect(() => {
    setSupported(detectSvgBackdropFilterSupport())
  }, [])

  const registerFilter = useMemo(() => {
    return (
      id: string,
      width: number,
      height: number,
      borderRadius: number,
      strength: GlassStrength = 'medium',
    ): string => {
      const filterId = `liquid-glass-${id}`

      if (!filtersRef.current.has(filterId)) {
        const dataUrl = getDisplacementMap(width, height, borderRadius, strength)
        const entry: FilterEntry = { id: filterId, width, height, borderRadius, strength, dataUrl }
        filtersRef.current.set(filterId, entry)
        setFilters(Array.from(filtersRef.current.values()))
      }

      return filterId
    }
  }, [])

  const contextValue = useMemo(
    () => ({ supportsLiquidGlass: supported, registerFilter }),
    [supported, registerFilter],
  )

  return (
    <LiquidGlassContext.Provider value={contextValue}>
      {/* Hidden SVG containing all liquid glass filter definitions */}
      {supported && filters.length > 0 && (
        <svg
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
          colorInterpolationFilters="sRGB"
          aria-hidden="true"
        >
          <defs>
            {filters.map((f) => (
              <filter key={f.id} id={f.id} x="0" y="0" width="100%" height="100%">
                <feImage
                  href={f.dataUrl}
                  x="0"
                  y="0"
                  width={f.width}
                  height={f.height}
                  result="displacement_map"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="displacement_map"
                  scale={f.strength === 'strong' ? 24 : f.strength === 'medium' ? 16 : 8}
                  xChannelSelector="R"
                  yChannelSelector="G"
                />
              </filter>
            ))}
          </defs>
        </svg>
      )}
      {children}
    </LiquidGlassContext.Provider>
  )
}
```

- [ ] **Step 2: コミット**

```bash
git add lib/glass/LiquidGlassProvider.tsx
git commit -m "feat(glass): add LiquidGlassProvider with SVG filter context"
```

---

## Task 3: useLiquidGlass Hook

**Files:**
- Create: `lib/glass/use-liquid-glass.ts`

- [ ] **Step 1: use-liquid-glass.ts を作成**

任意のDOM要素にリキッドグラス（or フォールバック）を適用するhook。

```typescript
// lib/glass/use-liquid-glass.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiquidGlassContext } from './LiquidGlassProvider'
import type { GlassStrength } from './displacement-map'

type UseLiquidGlassOptions = {
  /** Unique identifier for this glass element */
  id: string
  /** Refraction strength */
  strength?: GlassStrength
  /** Border radius in pixels */
  borderRadius?: number
  /** Whether the element has fixed dimensions (skip ResizeObserver) */
  fixedSize?: boolean
}

type UseLiquidGlassReturn = {
  /** Ref to attach to the glass element */
  ref: React.RefCallback<HTMLElement>
  /** CSS class name to apply */
  className: string
  /** Inline style for the backdrop-filter */
  style: React.CSSProperties
}

/**
 * Apply liquid glass effect to an element.
 *
 * On supported browsers (Chrome): applies SVG feDisplacementMap via backdrop-filter.
 * On others: applies high-quality glassmorphism fallback.
 */
export function useLiquidGlass({
  id,
  strength = 'medium',
  borderRadius = 16,
  fixedSize = false,
}: UseLiquidGlassOptions): UseLiquidGlassReturn {
  const { supportsLiquidGlass, registerFilter } = useLiquidGlassContext()
  const [filterId, setFilterId] = useState<string | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  const measureAndRegister = useCallback(
    (el: HTMLElement) => {
      const rect = el.getBoundingClientRect()
      const w = Math.round(rect.width)
      const h = Math.round(rect.height)
      if (w > 0 && h > 0) {
        const fId = registerFilter(id, w, h, borderRadius, strength)
        setFilterId(fId)
      }
    },
    [id, borderRadius, strength, registerFilter],
  )

  const refCallback = useCallback(
    (el: HTMLElement | null) => {
      // Cleanup previous observer
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }

      elementRef.current = el
      if (!el || !supportsLiquidGlass) return

      // Initial measurement
      measureAndRegister(el)

      // Watch for size changes (unless fixed)
      if (!fixedSize) {
        observerRef.current = new ResizeObserver(() => {
          if (elementRef.current) {
            measureAndRegister(elementRef.current)
          }
        })
        observerRef.current.observe(el)
      }
    },
    [supportsLiquidGlass, fixedSize, measureAndRegister],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  const style: React.CSSProperties = supportsLiquidGlass && filterId
    ? {
        backdropFilter: `url(#${filterId})`,
        WebkitBackdropFilter: `url(#${filterId})`,
      }
    : {
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      }

  return {
    ref: refCallback,
    className: supportsLiquidGlass ? 'liquid-glass-active' : 'liquid-glass-fallback',
    style,
  }
}
```

- [ ] **Step 2: コミット**

```bash
git add lib/glass/use-liquid-glass.ts
git commit -m "feat(glass): add useLiquidGlass hook with fallback"
```

---

## Task 4: UIパネルにリキッドグラスを適用

**Files:**
- Modify: `app/globals.css` (リキッドグラスのベースCSS追加)
- Modify: `components/board/Canvas.tsx` (LiquidGlassProvider wrapper)
- Modify: `components/board/FolderNav.module.css`
- Modify: `components/board/UrlInput.module.css`
- Modify: `components/board/ViewModeToggle.module.css`
- Modify: `components/board/ExportButton.module.css`
- Modify: `components/board/RandomPick.module.css`
- Modify: `components/board/FolderNav.tsx`, `UrlInput.tsx`, `ViewModeToggle.tsx`, `ExportButton.tsx`, `RandomPick.tsx`

- [ ] **Step 1: globals.css にリキッドグラスのベースCSS追加**

`app/globals.css` の末尾、`@media (prefers-reduced-motion)` の前に追加:

```css
/* ── Liquid Glass Base ────────────────────────────────────── */

.liquid-glass-active,
.liquid-glass-fallback {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: background var(--duration-fast) var(--ease-out-expo);
}

.liquid-glass-active:hover,
.liquid-glass-fallback:hover {
  background: rgba(255, 255, 255, 0.06);
}

/* Fallback: multi-layer shadow for depth (DM-ELEVATION-5 inspired) */
.liquid-glass-fallback {
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.08),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(0, 0, 0, 0.16),
    0 1px 1px -0.5px rgba(0, 0, 0, 0.18),
    0 3px 3px -1.5px rgba(0, 0, 0, 0.18),
    0 6px 6px -3px rgba(0, 0, 0, 0.18),
    0 12px 12px -6px rgba(0, 0, 0, 0.18);
}

[data-theme="light"] .liquid-glass-active,
[data-theme="light"] .liquid-glass-fallback {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(0, 0, 0, 0.08);
}

[data-theme="light"] .liquid-glass-active:hover,
[data-theme="light"] .liquid-glass-fallback:hover {
  background: rgba(255, 255, 255, 0.25);
}

[data-theme="light"] .liquid-glass-fallback {
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.5),
    0 0 0 1px rgba(0, 0, 0, 0.06),
    0 1px 1px -0.5px rgba(0, 0, 0, 0.08),
    0 3px 3px -1.5px rgba(0, 0, 0, 0.08),
    0 6px 6px -3px rgba(0, 0, 0, 0.08),
    0 12px 12px -6px rgba(0, 0, 0, 0.08);
}
```

- [ ] **Step 2: Canvas.tsx にLiquidGlassProviderをラップ**

`components/board/Canvas.tsx` を読み、最外側の `<div>` を `<LiquidGlassProvider>` でラップする。
import文に `import { LiquidGlassProvider } from '@/lib/glass/LiquidGlassProvider'` を追加。

- [ ] **Step 3: 各UIコンポーネントにuseLiquidGlassを適用**

各UIパネル（FolderNav, UrlInput, ViewModeToggle, ExportButton, RandomPick）で:

1. `import { useLiquidGlass } from '@/lib/glass/use-liquid-glass'` を追加
2. コンポーネント内で `const glass = useLiquidGlass({ id: 'folder-nav', strength: 'strong', fixedSize: true })` を呼ぶ
3. 最外側のdivに `ref={glass.ref}` と `style={{ ...glass.style }}` を適用
4. CSSモジュールの `backdrop-filter` 行を削除（hookが管理するため）

各コンポーネントのidは: `folder-nav`, `url-input`, `view-mode-toggle`, `export-button`, `random-pick`

- [ ] **Step 4: ビルド確認**

Run: `rtk next build`
Expected: ビルド成功

- [ ] **Step 5: dev serverで動作確認**

Run: `npm run dev`
ブラウザでボード画面を開き、UIパーツが透過していることを確認。
Chromeならリキッドグラスの屈折が見える（背景にカードがある場合）。

- [ ] **Step 6: コミット**

```bash
git add app/globals.css components/board/Canvas.tsx components/board/FolderNav.tsx components/board/UrlInput.tsx components/board/ViewModeToggle.tsx components/board/ExportButton.tsx components/board/RandomPick.tsx components/board/FolderNav.module.css components/board/UrlInput.module.css components/board/ViewModeToggle.module.css components/board/ExportButton.module.css components/board/RandomPick.module.css
git commit -m "feat(glass): apply liquid glass to all UI panels"
```

---

## Task 5: useCardTilt Hook（3D Tilt + Spotlight）

**Files:**
- Create: `lib/interactions/use-card-tilt.ts`

- [ ] **Step 1: use-card-tilt.ts を作成**

マウスホバー時のカード傾き＋スポットライト追従。`requestAnimationFrame` でバッチ処理し120fps維持。

```typescript
// lib/interactions/use-card-tilt.ts
'use client'

import { useCallback, useEffect, useRef } from 'react'

type UseCardTiltOptions = {
  /** Maximum tilt angle in degrees */
  maxTilt?: number
  /** Perspective value in pixels */
  perspective?: number
  /** Whether tilt is enabled */
  enabled?: boolean
}

type UseCardTiltReturn = {
  /** Attach to the card element */
  ref: React.RefCallback<HTMLElement>
}

/**
 * Adds 3D tilt and spotlight effect to a card on hover.
 *
 * - Tilt: perspective(800px) rotateX/Y based on mouse position
 * - Spotlight: radial-gradient overlay via CSS custom properties
 * - Shadow: shifts direction based on tilt angle
 *
 * All calculations are batched in requestAnimationFrame for 120fps.
 */
export function useCardTilt({
  maxTilt = 5,
  perspective = 800,
  enabled = true,
}: UseCardTiltOptions = {}): UseCardTiltReturn {
  const elementRef = useRef<HTMLElement | null>(null)
  const rafRef = useRef<number>(0)
  const isHoveringRef = useRef(false)

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!elementRef.current || !isHoveringRef.current) return

      // Cancel previous frame to batch
      if (rafRef.current) cancelAnimationFrame(rafRef.current)

      rafRef.current = requestAnimationFrame(() => {
        const el = elementRef.current
        if (!el) return

        const rect = el.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2

        // Normalized position: -1 to 1
        const normalizedX = (e.clientX - centerX) / (rect.width / 2)
        const normalizedY = (e.clientY - centerY) / (rect.height / 2)

        // Clamp to -1..1
        const clampedX = Math.max(-1, Math.min(1, normalizedX))
        const clampedY = Math.max(-1, Math.min(1, normalizedY))

        // Tilt: rotateX is inverted (mouse top = tilt away)
        const rotateX = -clampedY * maxTilt
        const rotateY = clampedX * maxTilt

        el.style.transform =
          `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.03)`

        // Spotlight position (for ::after gradient)
        el.style.setProperty('--spotlight-x', `${((clampedX + 1) / 2) * 100}%`)
        el.style.setProperty('--spotlight-y', `${((clampedY + 1) / 2) * 100}%`)
        el.style.setProperty('--spotlight-opacity', '1')

        // Dynamic shadow based on tilt direction
        const shadowX = clampedX * 8
        const shadowY = clampedY * 8
        el.style.setProperty(
          '--tilt-shadow',
          `${shadowX}px ${shadowY + 12}px 24px rgba(0,0,0,0.3)`,
        )
      })
    },
    [maxTilt, perspective],
  )

  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true
  }, [])

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const el = elementRef.current
    if (!el) return

    // Smooth reset
    el.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
    el.style.transform = ''
    el.style.setProperty('--spotlight-opacity', '0')
    el.style.setProperty('--tilt-shadow', '')

    // Remove transition after it completes to not interfere with mousemove
    setTimeout(() => {
      if (el) el.style.transition = ''
    }, 400)
  }, [])

  const refCallback = useCallback(
    (el: HTMLElement | null) => {
      // Cleanup previous
      const prev = elementRef.current
      if (prev) {
        prev.removeEventListener('mousemove', handleMouseMove)
        prev.removeEventListener('mouseenter', handleMouseEnter)
        prev.removeEventListener('mouseleave', handleMouseLeave)
      }

      elementRef.current = el
      if (!el || !enabled) return

      el.addEventListener('mousemove', handleMouseMove, { passive: true })
      el.addEventListener('mouseenter', handleMouseEnter, { passive: true })
      el.addEventListener('mouseleave', handleMouseLeave, { passive: true })
    },
    [enabled, handleMouseMove, handleMouseEnter, handleMouseLeave],
  )

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const el = elementRef.current
      if (el) {
        el.removeEventListener('mousemove', handleMouseMove)
        el.removeEventListener('mouseenter', handleMouseEnter)
        el.removeEventListener('mouseleave', handleMouseLeave)
      }
    }
  }, [handleMouseMove, handleMouseEnter, handleMouseLeave])

  return { ref: refCallback }
}
```

- [ ] **Step 2: コミット**

```bash
git add lib/interactions/use-card-tilt.ts
git commit -m "feat(interactions): add useCardTilt hook with 3D tilt and spotlight"
```

---

## Task 6: Tilt + Spotlight を DraggableCard に統合

**Files:**
- Modify: `components/board/DraggableCard.tsx`
- Modify: `components/board/DraggableCard.module.css`

- [ ] **Step 1: DraggableCard.module.css にspotlight + tilt-shadow スタイル追加**

```css
/* 既存の .wrapper ルールの後に追加 */

.wrapper::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(
    circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%),
    rgba(255, 255, 255, 0.15) 0%,
    transparent 60%
  );
  opacity: var(--spotlight-opacity, 0);
  transition: opacity var(--duration-fast, 200ms) ease;
  pointer-events: none;
  z-index: 1;
}

/* Override box-shadow when tilt-shadow is set */
.wrapper[style*="--tilt-shadow"] {
  box-shadow: var(--tilt-shadow);
}
```

- [ ] **Step 2: DraggableCard.tsx に useCardTilt を統合**

DraggableCard の props に `enableTilt?: boolean` を追加（デフォルト true）。
`useCardTilt` を import し、tilt の ref と wrapper の ref をマージする。

注意: GSAP Draggable と tilt は同時に動作する必要がある。ドラッグ中は tilt を一時停止する。
`onDragStart` で `el.style.transition = 'none'` + tilt リセット、`onDragEnd` で tilt を再有効化。

```tsx
// DraggableCard.tsx の変更箇所:
// 1. import { useCardTilt } from '@/lib/interactions/use-card-tilt'
// 2. const tilt = useCardTilt({ enabled: draggable && enableTilt })
// 3. refCallback で両方の ref を結合
```

- [ ] **Step 3: ビルド確認 + 動作確認**

Run: `rtk next build` → 成功確認
Run: `npm run dev` → ブラウザでカードホバー時にtilt + spotlightが動くことを確認

- [ ] **Step 4: コミット**

```bash
git add components/board/DraggableCard.tsx components/board/DraggableCard.module.css
git commit -m "feat(interactions): integrate 3D tilt and spotlight into DraggableCard"
```

---

## Task 7: 距離ベースリパルション

**Files:**
- Create: `lib/interactions/use-card-repulsion.ts`
- Modify: `app/(app)/board/board-client.tsx`

- [ ] **Step 1: use-card-repulsion.ts を作成**

ドラッグ中のカードから他のカードを距離に応じて押しのけるhook。

```typescript
// lib/interactions/use-card-repulsion.ts
'use client'

import { useCallback, useRef } from 'react'
import { gsap } from 'gsap'

type CardPosition = {
  id: string
  x: number
  y: number
}

type UseCardRepulsionOptions = {
  /** Maximum repulsion force in pixels */
  maxForce?: number
  /** Radius within which cards are affected */
  radius?: number
  /** Whether repulsion is enabled */
  enabled?: boolean
}

/**
 * Distance-based card repulsion during drag.
 *
 * force = maxForce × (1 - distance / radius)²
 *
 * Cards closer to the dragged card move more; cards further away move less.
 * All cards within radius are affected (no arbitrary limit).
 */
export function useCardRepulsion({
  maxForce = 40,
  radius = 300,
  enabled = true,
}: UseCardRepulsionOptions = {}) {
  const rafRef = useRef<number>(0)
  const originalPositions = useRef<Map<string, { x: number; y: number }>>(new Map())

  /**
   * Call on each drag frame with the current dragged card position.
   * Animates nearby cards away from the drag source.
   */
  const applyRepulsion = useCallback(
    (draggedId: string, dragX: number, dragY: number, allCards: CardPosition[]) => {
      if (!enabled) return

      if (rafRef.current) cancelAnimationFrame(rafRef.current)

      rafRef.current = requestAnimationFrame(() => {
        for (const card of allCards) {
          if (card.id === draggedId) continue

          const el = document.querySelector<HTMLElement>(`[data-card-wrapper="${card.id}"]`)
          if (!el) continue

          // Store original position on first call
          if (!originalPositions.current.has(card.id)) {
            originalPositions.current.set(card.id, { x: card.x, y: card.y })
          }

          const dx = card.x - dragX
          const dy = card.y - dragY
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance > radius || distance < 1) {
            // Outside radius — reset to original
            gsap.to(el, {
              x: 0,
              y: 0,
              duration: 0.3,
              ease: 'power2.out',
              overwrite: 'auto',
            })
            continue
          }

          // Quadratic falloff: closer = stronger
          const strength = maxForce * Math.pow(1 - distance / radius, 2)

          // Direction: away from dragged card
          const angle = Math.atan2(dy, dx)
          const pushX = Math.cos(angle) * strength
          const pushY = Math.sin(angle) * strength

          gsap.to(el, {
            x: pushX,
            y: pushY,
            duration: 0.2,
            ease: 'power2.out',
            overwrite: 'auto',
          })
        }
      })
    },
    [enabled, maxForce, radius],
  )

  /**
   * Call when drag ends to reset all repulsed cards to their original positions.
   */
  const resetRepulsion = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const wrappers = document.querySelectorAll<HTMLElement>('[data-card-wrapper]')
    wrappers.forEach((el) => {
      gsap.to(el, {
        x: 0,
        y: 0,
        duration: 0.5,
        ease: 'back.out(1.4)',
        overwrite: 'auto',
      })
    })

    originalPositions.current.clear()
  }, [])

  return { applyRepulsion, resetRepulsion }
}
```

- [ ] **Step 2: board-client.tsx にリパルションを統合**

`board-client.tsx` で `useCardRepulsion` を呼び、`handleDragEnd` を拡張:
- DraggableCard の `onDrag` callback（新規props）でリパルション計算
- `onDragEnd` で `resetRepulsion()` を呼ぶ

DraggableCard に `onDrag?: (cardId: string, x: number, y: number) => void` propsを追加し、
GSAP Draggable の `onDrag` から呼ぶ。

- [ ] **Step 3: ビルド確認 + 動作確認**

- [ ] **Step 4: コミット**

```bash
git add lib/interactions/use-card-repulsion.ts components/board/DraggableCard.tsx app/(app)/board/board-client.tsx
git commit -m "feat(interactions): add distance-based card repulsion during drag"
```

---

## Task 8: 着地アニメーション（バウンス + 波紋）

**Files:**
- Create: `lib/interactions/ripple.ts`
- Modify: `app/globals.css` (波紋keyframes)
- Modify: `components/board/DraggableCard.tsx`

- [ ] **Step 1: globals.css に波紋keyframes追加**

```css
/* ── Ripple Effect (Card Landing) ─────────────────────────── */

@keyframes card-ripple {
  0% {
    transform: scale(0.5);
    opacity: 0.4;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}
```

- [ ] **Step 2: ripple.ts を作成**

```typescript
// lib/interactions/ripple.ts

/**
 * Create a temporary ripple element at the drop location.
 * The ripple animates via CSS @keyframes card-ripple and self-destructs.
 */
export function createRipple(x: number, y: number, parentElement: HTMLElement): void {
  const ripple = document.createElement('div')
  ripple.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    width: 100px;
    height: 100px;
    margin-left: -50px;
    margin-top: -50px;
    border-radius: 50%;
    border: 2px solid var(--color-accent-primary);
    opacity: 0;
    pointer-events: none;
    animation: card-ripple 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  `
  parentElement.appendChild(ripple)

  // Self-destruct after animation
  ripple.addEventListener('animationend', () => {
    ripple.remove()
  })
}
```

- [ ] **Step 3: DraggableCard.tsx の onDragEnd にバウンス + 波紋を追加**

既存の `onDragEnd` 内で:
1. `gsap.to(el, { scale: 1.0, duration: 0.4, ease: 'back.out(1.7)' })` は既にある（バウンス）
2. `createRipple()` を呼んで波紋エフェクトを追加

```typescript
// onDragEnd 内に追加:
import { createRipple } from '@/lib/interactions/ripple'

// ドラッグ終了時
const worldEl = el.closest('[class*="world"]') as HTMLElement | null
if (worldEl) {
  const rect = el.getBoundingClientRect()
  const worldRect = worldEl.getBoundingClientRect()
  createRipple(
    rect.left - worldRect.left + rect.width / 2,
    rect.top - worldRect.top + rect.height / 2,
    worldEl,
  )
}
```

- [ ] **Step 4: コミット**

```bash
git add lib/interactions/ripple.ts app/globals.css components/board/DraggableCard.tsx
git commit -m "feat(interactions): add bounce and ripple effect on card landing"
```

---

## Task 9: FPS監視 + 自動段階的劣化

**Files:**
- Create: `lib/interactions/use-frame-monitor.ts`

- [ ] **Step 1: use-frame-monitor.ts を作成**

```typescript
// lib/interactions/use-frame-monitor.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** Performance tiers — each tier disables more effects */
export type PerformanceTier = 'full' | 'reduced-spotlight' | 'reduced-animation' | 'minimal'

const TIER_ORDER: PerformanceTier[] = ['full', 'reduced-spotlight', 'reduced-animation', 'minimal']

/**
 * Monitor frame rate and automatically degrade effects when FPS drops.
 *
 * Target: 120fps (8.33ms per frame).
 * If average frame time exceeds 16.67ms (60fps) for 30 consecutive frames,
 * drop one tier.
 */
export function useFrameMonitor(cardCount: number): PerformanceTier {
  const [tier, setTier] = useState<PerformanceTier>('full')
  const frameTimesRef = useRef<number[]>([])
  const lastFrameRef = useRef<number>(0)
  const rafRef = useRef<number>(0)
  const tierIndexRef = useRef(0)

  // Auto-adjust tier based on card count
  useEffect(() => {
    let baseTier = 0
    if (cardCount > 200) baseTier = 3
    else if (cardCount > 100) baseTier = 2
    else if (cardCount > 50) baseTier = 1

    if (baseTier > tierIndexRef.current) {
      tierIndexRef.current = baseTier
      setTier(TIER_ORDER[baseTier])
    }
  }, [cardCount])

  // Frame time measurement loop
  useEffect(() => {
    let running = true

    function measure(now: number): void {
      if (!running) return

      if (lastFrameRef.current > 0) {
        const delta = now - lastFrameRef.current
        frameTimesRef.current.push(delta)

        // Keep last 60 frame times
        if (frameTimesRef.current.length > 60) {
          frameTimesRef.current.shift()
        }

        // Check every 30 frames
        if (frameTimesRef.current.length >= 30) {
          const avg =
            frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length

          // If avg > 16.67ms (below 60fps), degrade
          if (avg > 16.67 && tierIndexRef.current < TIER_ORDER.length - 1) {
            tierIndexRef.current++
            setTier(TIER_ORDER[tierIndexRef.current])
            frameTimesRef.current = [] // Reset after tier change
          }
        }
      }

      lastFrameRef.current = now
      rafRef.current = requestAnimationFrame(measure)
    }

    rafRef.current = requestAnimationFrame(measure)

    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return tier
}
```

- [ ] **Step 2: コミット**

```bash
git add lib/interactions/use-frame-monitor.ts
git commit -m "feat(perf): add frame monitor with auto-degradation tiers"
```

---

## Task 10: カードサイズ定数 + ランダム生成

**Files:**
- Create: `lib/canvas/card-sizing.ts`
- Modify: `lib/constants.ts`

- [ ] **Step 1: constants.ts にサイズ/アスペクト比の定数追加**

`lib/constants.ts` の末尾に追加:

```typescript
// ---------------------------------------------------------------------------
// Card Sizing
// ---------------------------------------------------------------------------

/** Card size presets (width in pixels) */
export const CARD_SIZES = {
  S: 160,
  M: 240,
  L: 320,
  XL: 480,
} as const

export type CardSizePreset = keyof typeof CARD_SIZES

/** Card aspect ratio presets */
export const CARD_ASPECT_RATIOS = {
  auto: null,      // Use thumbnail's natural ratio
  square: 1,       // 1:1
  landscape: 16/9, // 16:9
  portrait: 3/4,   // 3:4
} as const

export type CardAspectPreset = keyof typeof CARD_ASPECT_RATIOS

/** Sizes eligible for random assignment (XL is manual only) */
export const RANDOM_CARD_SIZES: CardSizePreset[] = ['S', 'M', 'L']

/** All aspect ratios eligible for random assignment */
export const RANDOM_ASPECT_RATIOS: CardAspectPreset[] = ['auto', 'square', 'landscape', 'portrait']
```

また `DB_VERSION` を `2` → `3` に変更。

- [ ] **Step 2: card-sizing.ts を作成**

```typescript
// lib/canvas/card-sizing.ts

import {
  CARD_SIZES,
  CARD_ASPECT_RATIOS,
  RANDOM_CARD_SIZES,
  RANDOM_ASPECT_RATIOS,
  type CardSizePreset,
  type CardAspectPreset,
} from '@/lib/constants'

type CardDimensions = {
  width: number
  height: number
  sizePreset: CardSizePreset
  aspectPreset: CardAspectPreset
}

/**
 * Generate random card dimensions based on user preferences.
 *
 * @param preferredSize - 'random' or a specific preset
 * @param preferredAspect - 'random' or a specific preset
 * @param thumbnailAspect - Natural aspect ratio of the thumbnail (if available)
 */
export function generateCardDimensions(
  preferredSize: 'random' | CardSizePreset = 'random',
  preferredAspect: 'random' | CardAspectPreset = 'random',
  thumbnailAspect?: number,
): CardDimensions {
  // Pick size
  const sizePreset: CardSizePreset =
    preferredSize === 'random'
      ? RANDOM_CARD_SIZES[Math.floor(Math.random() * RANDOM_CARD_SIZES.length)]
      : preferredSize

  const width = CARD_SIZES[sizePreset]

  // Pick aspect ratio
  const aspectPreset: CardAspectPreset =
    preferredAspect === 'random'
      ? RANDOM_ASPECT_RATIOS[Math.floor(Math.random() * RANDOM_ASPECT_RATIOS.length)]
      : preferredAspect

  // Calculate height
  let ratio = CARD_ASPECT_RATIOS[aspectPreset]
  if (ratio === null) {
    // 'auto' — use thumbnail aspect or default to 4:3
    ratio = thumbnailAspect ?? 4 / 3
  }

  const height = Math.round(width / ratio)

  return { width, height, sizePreset, aspectPreset }
}
```

- [ ] **Step 3: コミット**

```bash
git add lib/constants.ts lib/canvas/card-sizing.ts
git commit -m "feat(sizing): add card size/aspect ratio presets and random generator"
```

---

## Task 11: DB Migration v3

**Files:**
- Modify: `lib/storage/indexeddb.ts`

- [ ] **Step 1: CardRecord に width/height を追加**

`CardRecord` interface に追加:
```typescript
/** Card width in pixels */
width: number
/** Card height in pixels */
height: number
```

- [ ] **Step 2: AllMarksDB interface に preferences store を追加**

```typescript
/** User preferences stored in IndexedDB */
export interface UserPreferencesRecord {
  /** Always 'main' (singleton) */
  key: 'main'
  bgTheme: string
  cardStyle: 'glass' | 'polaroid' | 'newspaper' | 'magnet'
  uiTheme: 'auto' | 'dark' | 'light'
  defaultCardSize: 'random' | 'S' | 'M' | 'L' | 'XL'
  defaultAspectRatio: 'random' | 'auto' | '1:1' | '16:9' | '3:4'
  reducedMotion: boolean
}

// AllMarksDB interface に追加:
interface AllMarksDB {
  bookmarks: BookmarkRecord
  folders: FolderRecord
  cards: CardRecord
  settings: SettingsRecord
  preferences: UserPreferencesRecord  // 新規
}
```

- [ ] **Step 3: v2→v3 migration を追加**

`initDB` の `upgrade` 関数内に追加:

```typescript
// ── v2 → v3: add width/height to cards, add preferences store ──
if (oldVersion < 3) {
  // Add preferences store
  db.createObjectStore('preferences', { keyPath: 'key' })

  // Migrate existing cards to include width/height
  const cardStore = transaction.objectStore('cards')
  void cardStore.openCursor().then(function addSizeFields(
    cursor: Awaited<ReturnType<typeof cardStore.openCursor>>,
  ): Promise<void> | undefined {
    if (!cursor) return
    const card = {
      ...cursor.value,
      width: (cursor.value as CardRecord & { width?: number }).width ?? 240,
      height: (cursor.value as CardRecord & { height?: number }).height ?? 180,
    }
    void cursor.update(card)
    return cursor.continue().then(addSizeFields)
  })
}
```

- [ ] **Step 4: addBookmark でランダムサイズを適用**

`addBookmark` 関数内の `card` 作成部分を修正:

```typescript
import { generateCardDimensions } from '@/lib/canvas/card-sizing'

// addBookmark 内:
const dimensions = generateCardDimensions('random', 'random')
const card: CardRecord = {
  id: uuid(),
  bookmarkId: bookmark.id,
  folderId: bookmark.folderId,
  x: pos.x,
  y: pos.y,
  rotation: randomRotation(),
  scale: 1,
  zIndex: 1,
  gridIndex,
  isManuallyPlaced: false,
  width: dimensions.width,
  height: dimensions.height,
}
```

- [ ] **Step 5: preferences CRUD 関数を追加**

```typescript
/** Default user preferences */
export const DEFAULT_PREFERENCES: UserPreferencesRecord = {
  key: 'main',
  bgTheme: 'dark',
  cardStyle: 'glass',
  uiTheme: 'auto',
  defaultCardSize: 'random',
  defaultAspectRatio: 'random',
  reducedMotion: false,
}

/** Get user preferences (returns defaults if not set) */
export async function getPreferences(
  db: IDBPDatabase<AllMarksDB>,
): Promise<UserPreferencesRecord> {
  const prefs = await db.get('preferences', 'main')
  return prefs ?? DEFAULT_PREFERENCES
}

/** Save user preferences */
export async function savePreferences(
  db: IDBPDatabase<AllMarksDB>,
  prefs: Partial<Omit<UserPreferencesRecord, 'key'>>,
): Promise<void> {
  const current = await getPreferences(db)
  await db.put('preferences', { ...current, ...prefs, key: 'main' })
}
```

- [ ] **Step 6: ビルド確認**

- [ ] **Step 7: コミット**

```bash
git add lib/storage/indexeddb.ts
git commit -m "feat(db): migration v3 — card width/height, preferences store"
```

---

## Task 12: BookmarkCard 可変サイズ対応

**Files:**
- Modify: `components/board/BookmarkCard.tsx`
- Modify: `components/board/BookmarkCard.module.css`

- [ ] **Step 1: BookmarkCard.module.css の固定幅を削除**

```css
/* .card の width: 240px; を削除し、CSS変数に置き換え */
.card {
  width: var(--card-width, 240px);
  /* ... 残りは変更なし */
}
```

- [ ] **Step 2: BookmarkCard.tsx に width/height props を追加**

```tsx
type BookmarkCardProps = {
  bookmark: BookmarkRecord
  style?: React.CSSProperties
  /** Card width in pixels */
  width?: number
  /** Card height in pixels */
  height?: number
}

export function BookmarkCard({ bookmark, style, width, height }: BookmarkCardProps): React.ReactElement {
  const cardStyle: React.CSSProperties = {
    ...style,
    ['--card-width' as string]: width ? `${width}px` : undefined,
  }
  // aspect-ratio は height が指定されていれば .thumbnailWrapper に適用

  return (
    <div className={styles.card} style={cardStyle}>
      {/* ... 既存のレンダリング ... */}
    </div>
  )
}
```

- [ ] **Step 3: board-client.tsx から width/height を渡す**

board-client.tsx の BookmarkCard/TweetCard レンダリング部分で `card.width` と `card.height` を props に渡す。

- [ ] **Step 4: コミット**

```bash
git add components/board/BookmarkCard.tsx components/board/BookmarkCard.module.css app/(app)/board/board-client.tsx
git commit -m "feat(cards): variable card sizing with width/height from DB"
```

---

## Task 13: カードリサイズハンドル

**Files:**
- Create: `components/board/ResizeHandle.tsx`
- Create: `components/board/ResizeHandle.module.css`
- Modify: `components/board/DraggableCard.tsx`

- [ ] **Step 1: ResizeHandle.module.css を作成**

```css
.handle {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity var(--duration-fast) ease;
  z-index: 2;
}

/* Show on card hover */
*:hover > .handle {
  opacity: 0.6;
}

.handle:hover {
  opacity: 1 !important;
}

.handle::before {
  content: '';
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--color-text-tertiary);
  border-bottom: 2px solid var(--color-text-tertiary);
  border-radius: 0 0 2px 0;
}
```

- [ ] **Step 2: ResizeHandle.tsx を作成**

```tsx
// components/board/ResizeHandle.tsx
'use client'

import { useCallback, useRef } from 'react'
import { gsap } from 'gsap'
import styles from './ResizeHandle.module.css'

type ResizeHandleProps = {
  cardId: string
  currentWidth: number
  currentHeight: number
  zoom: number
  onResizeEnd: (cardId: string, width: number, height: number) => void
}

export function ResizeHandle({
  cardId,
  currentWidth,
  currentHeight,
  zoom,
  onResizeEnd,
}: ResizeHandleProps): React.ReactElement {
  const startRef = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const cardElRef = useRef<HTMLElement | null>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()

      const cardEl = (e.target as HTMLElement).closest('[data-card-wrapper]') as HTMLElement | null
      cardElRef.current = cardEl

      startRef.current = {
        x: e.clientX,
        y: e.clientY,
        w: currentWidth,
        h: currentHeight,
      }

      const handlePointerMove = (moveEvent: PointerEvent): void => {
        const dx = (moveEvent.clientX - startRef.current.x) / zoom
        const dy = (moveEvent.clientY - startRef.current.y) / zoom
        const newWidth = Math.max(120, Math.round(startRef.current.w + dx))
        const newHeight = Math.max(80, Math.round(startRef.current.h + dy))

        if (cardEl) {
          const inner = cardEl.firstElementChild as HTMLElement | null
          if (inner) {
            inner.style.setProperty('--card-width', `${newWidth}px`)
          }
        }
      }

      const handlePointerUp = (upEvent: PointerEvent): void => {
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', handlePointerUp)

        const dx = (upEvent.clientX - startRef.current.x) / zoom
        const dy = (upEvent.clientY - startRef.current.y) / zoom
        const finalWidth = Math.max(120, Math.round(startRef.current.w + dx))
        const finalHeight = Math.max(80, Math.round(startRef.current.h + dy))

        onResizeEnd(cardId, finalWidth, finalHeight)
      }

      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', handlePointerUp)
    },
    [cardId, currentWidth, currentHeight, zoom, onResizeEnd],
  )

  return (
    <div
      className={styles.handle}
      onPointerDown={handlePointerDown}
    />
  )
}
```

- [ ] **Step 3: DraggableCard.tsx に ResizeHandle を配置**

DraggableCard の children の後に `<ResizeHandle>` を配置。
新しいprops: `cardWidth`, `cardHeight`, `onResizeEnd`。

- [ ] **Step 4: board-client.tsx に onResizeEnd ハンドラ追加**

```typescript
const handleResizeEnd = useCallback(
  async (cardId: string, width: number, height: number): Promise<void> => {
    if (!db) return
    await updateCard(db, cardId, { width, height })
    // Reload items to reflect new size
    // ... (既存の loadItems パターンを再利用)
  },
  [db],
)
```

- [ ] **Step 5: コミット**

```bash
git add components/board/ResizeHandle.tsx components/board/ResizeHandle.module.css components/board/DraggableCard.tsx app/(app)/board/board-client.tsx
git commit -m "feat(cards): add resize handle for variable card dimensions"
```

---

## Task 14: CardStyleWrapper + Glass スタイル

**Files:**
- Create: `components/board/card-styles/CardStyleWrapper.tsx`
- Create: `components/board/card-styles/CardStyleWrapper.module.css`

- [ ] **Step 1: CardStyleWrapper.module.css を作成**

4つのカードスタイル全てのCSSを1ファイルに定義。

```css
/* ── Glass Style ──────────────────────────────────────────── */

.glass {
  border-radius: var(--radius-lg);
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.glass > * {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
}

[data-theme="light"] .glass {
  border-color: rgba(0, 0, 0, 0.08);
}

[data-theme="light"] .glass > * {
  background: rgba(255, 255, 255, 0.15);
}

.glass:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

/* ── Polaroid Style ───────────────────────────────────────── */

.polaroid {
  background: #f0ede8;
  padding: 8px 8px 32px 8px;
  border-radius: 2px;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.1),
    0 8px 16px rgba(0, 0, 0, 0.08);
  /* Paper texture via noise */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
}

[data-theme="light"] .polaroid {
  background-color: #ffffff;
}

.polaroid:hover {
  box-shadow:
    0 4px 8px rgba(0, 0, 0, 0.12),
    0 16px 32px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.polaroidCaption {
  position: absolute;
  bottom: 6px;
  left: 8px;
  right: 8px;
  font-family: 'Caveat', cursive;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  text-align: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ── Newspaper Style ──────────────────────────────────────── */

.newspaper {
  background-color: #f4e8c1;
  filter: sepia(0.15) contrast(1.05);
  /* Irregular edges via clip-path */
  clip-path: polygon(
    2% 0%, 98% 1%, 100% 3%, 99% 97%, 97% 100%, 3% 99%, 0% 96%, 1% 2%
  );
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  /* Noise texture */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");
}

[data-theme="dark"] .newspaper {
  background-color: #d4c89a;
}

.newspaper:hover {
  filter: sepia(0.05) contrast(1.05);
}

/* Override text style for newspaper */
.newspaper :global(.siteName),
.newspaper :global(.noThumbTitle),
.newspaper :global(.overlayTitle) {
  font-family: Georgia, 'Times New Roman', serif;
}

/* ── Magnet Style ─────────────────────────────────────────── */

.magnet {
  background: #ffffff;
  border-radius: 8px;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.06);
  position: relative;
  overflow: visible;
}

[data-theme="dark"] .magnet {
  background: #f5f5f5;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    0 4px 16px rgba(0, 0, 0, 0.2);
}

/* Magnet pin decoration */
.magnet::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 12px;
  border-radius: 4px 4px 2px 2px;
  background: var(--magnet-color, var(--color-accent-primary));
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  z-index: 2;
}

@keyframes wobble {
  0%, 100% { transform: translateX(-50%) rotate(0deg); }
  25% { transform: translateX(-50%) rotate(-5deg); }
  75% { transform: translateX(-50%) rotate(5deg); }
}

.magnet:hover::before {
  animation: wobble 0.4s ease-in-out;
}

.magnet:hover {
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.12),
    0 8px 24px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}
```

- [ ] **Step 2: CardStyleWrapper.tsx を作成**

```tsx
// components/board/card-styles/CardStyleWrapper.tsx
'use client'

import styles from './CardStyleWrapper.module.css'

export type CardStyle = 'glass' | 'polaroid' | 'newspaper' | 'magnet'

type CardStyleWrapperProps = {
  children: React.ReactNode
  style: CardStyle
  title?: string
  magnetColor?: string
}

/**
 * Wraps card content in the appropriate visual style container.
 */
export function CardStyleWrapper({
  children,
  style: cardStyle,
  title,
  magnetColor,
}: CardStyleWrapperProps): React.ReactElement {
  const className = styles[cardStyle] ?? styles.glass

  return (
    <div
      className={className}
      style={magnetColor ? { ['--magnet-color' as string]: magnetColor } : undefined}
    >
      {children}
      {cardStyle === 'polaroid' && title && (
        <span className={styles.polaroidCaption}>{title}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 3: board-client.tsx でCardStyleWrapperを使用**

各カードのレンダリングを `<CardStyleWrapper style={cardStyle}>` でラップ。
`cardStyle` はstateとして管理（初期値 `'glass'`）。

- [ ] **Step 4: コミット**

```bash
git add components/board/card-styles/CardStyleWrapper.tsx components/board/card-styles/CardStyleWrapper.module.css app/(app)/board/board-client.tsx
git commit -m "feat(styles): add 4 card styles — glass, polaroid, newspaper, magnet"
```

---

## Task 15: テーマ→カラーモード自動マッピング

**Files:**
- Create: `lib/theme/theme-utils.ts`

- [ ] **Step 1: theme-utils.ts を作成**

```typescript
// lib/theme/theme-utils.ts

/** Map of background themes to their color mode */
const THEME_COLOR_MODES: Record<string, 'dark' | 'light'> = {
  dark: 'dark',
  space: 'dark',
  ocean: 'dark',
  forest: 'dark',
  grid: 'dark',
  cork: 'light',
  'minimal-white': 'light',
  cardboard: 'light',
  'custom-image': 'dark', // Default for unknown images
}

/**
 * Determine the color mode for a given background theme.
 */
export function getColorModeForTheme(theme: string, customColor?: string): 'dark' | 'light' {
  if (theme === 'custom-color' && customColor) {
    return getColorModeForColor(customColor)
  }
  return THEME_COLOR_MODES[theme] ?? 'dark'
}

/**
 * Calculate relative luminance of a hex color and return appropriate mode.
 * Uses the W3C relative luminance formula.
 */
export function getColorModeForColor(hexColor: string): 'dark' | 'light' {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255

  // sRGB to linear
  const linearR = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)
  const linearG = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)
  const linearB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)

  const luminance = 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB

  return luminance >= 0.5 ? 'light' : 'dark'
}

/**
 * Resolve effective UI theme.
 */
export function resolveUiTheme(
  uiTheme: 'auto' | 'dark' | 'light',
  dataTheme: 'dark' | 'light',
): 'dark' | 'light' {
  return uiTheme === 'auto' ? dataTheme : uiTheme
}
```

- [ ] **Step 2: コミット**

```bash
git add lib/theme/theme-utils.ts
git commit -m "feat(theme): add theme-to-color-mode mapping and luminance utils"
```

---

## Task 16: Cardboard背景テーマ + UIモードトグル

**Files:**
- Modify: `app/globals.css` (cardboard theme追加)
- Modify: `app/layout.tsx` (data-ui-theme属性、手書きフォント)
- Modify: `components/board/ThemeSelector.tsx` (cardboard追加)

- [ ] **Step 1: globals.css にcardboardテーマ追加**

Background Themes セクションに追加:

```css
[data-bg-theme="cardboard"] {
  background-color: #d2c8ba;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E");
}
```

- [ ] **Step 2: layout.tsx に data-ui-theme 属性と手書きフォント追加**

```tsx
import { Inter, Outfit, Caveat } from 'next/font/google'

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-handwriting',
  display: 'swap',
})

// html タグに data-ui-theme="auto" を追加:
<html lang="ja" data-theme="dark" data-ui-theme="auto" data-card-style="glass">
  <body className={`${inter.variable} ${outfit.variable} ${caveat.variable}`}>
```

- [ ] **Step 3: ThemeSelector に cardboard テーマを追加**

THEMES配列に追加:
```typescript
{ id: 'cardboard', label: '厚紙', bg: '#d2c8ba' },
```

- [ ] **Step 4: コミット**

```bash
git add app/globals.css app/layout.tsx components/board/ThemeSelector.tsx
git commit -m "feat(theme): add cardboard background, handwriting font, data-ui-theme attr"
```

---

## Task 17: 統合設定パネル

**Files:**
- Create: `components/board/SettingsPanel.tsx`
- Create: `components/board/SettingsPanel.module.css`

- [ ] **Step 1: SettingsPanel.module.css を作成**

設定パネルのレイアウト。セクション分け（背景テーマ、カードスタイル、UIモード、カードデフォルト）。

```css
.wrapper {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-4);
  z-index: 70;
}

.toggle {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  cursor: pointer;
}

.panel {
  position: absolute;
  bottom: calc(100% + var(--space-2));
  right: 0;
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  min-width: 260px;
  max-height: 70vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sectionTitle {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-2);
}

.swatchGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.swatch {
  width: 100%;
  aspect-ratio: 1.4;
  border-radius: var(--radius-sm);
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color var(--duration-instant);
}

.swatch:hover {
  border-color: var(--color-accent-primary);
}

.swatchActive {
  composes: swatch;
  border-color: var(--color-accent-primary);
}

.optionRow {
  display: flex;
  gap: var(--space-1);
}

.optionButton {
  flex: 1;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  cursor: pointer;
  text-align: center;
  transition:
    background var(--duration-fast),
    border-color var(--duration-fast),
    color var(--duration-fast);
}

.optionButton:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-primary);
}

.optionButtonActive {
  composes: optionButton;
  border-color: var(--color-accent-primary);
  color: var(--color-accent-primary);
  background: rgba(124, 92, 252, 0.1);
}
```

- [ ] **Step 2: SettingsPanel.tsx を作成**

既存のThemeSelectorの機能を包含しつつ、カードスタイル・UIモード・カードデフォルト設定を追加。
`useLiquidGlass` でパネル自体にリキッドグラスを適用。

Props: `currentBgTheme`, `onChangeBgTheme`, `currentCardStyle`, `onChangeCardStyle`,
`currentUiTheme`, `onChangeUiTheme`, `defaultCardSize`, `onChangeDefaultCardSize`,
`defaultAspectRatio`, `onChangeDefaultAspectRatio`

このコンポーネントは既存のThemeSelectorを置き換える。

- [ ] **Step 3: board-client.tsx でSettingsPanelを使用**

ThemeSelectorをSettingsPanelに置き換え。
新しいstate: `cardStyle`, `uiTheme`, `defaultCardSize`, `defaultAspectRatio`。

- [ ] **Step 4: コミット**

```bash
git add components/board/SettingsPanel.tsx components/board/SettingsPanel.module.css app/(app)/board/board-client.tsx
git commit -m "feat(settings): add unified settings panel with card style/UI mode/sizing options"
```

---

## Task 18: テーマ連動の配線

**Files:**
- Modify: `app/(app)/board/board-client.tsx`

- [ ] **Step 1: board-client.tsx にテーマ連動ロジックを追加**

```typescript
import { getColorModeForTheme, resolveUiTheme } from '@/lib/theme/theme-utils'
import { useFrameMonitor } from '@/lib/interactions/use-frame-monitor'

// bgTheme が変わるたびに data-theme を自動更新:
useEffect(() => {
  const colorMode = getColorModeForTheme(bgTheme)
  document.documentElement.setAttribute('data-theme', colorMode)
}, [bgTheme])

// uiTheme が変わるたびに data-ui-theme を更新:
useEffect(() => {
  document.documentElement.setAttribute('data-ui-theme', uiTheme)
}, [uiTheme])

// cardStyle が変わるたびに data-card-style を更新:
useEffect(() => {
  document.documentElement.setAttribute('data-card-style', cardStyle)
}, [cardStyle])

// prefers-color-scheme の初期値判定:
useEffect(() => {
  if (typeof window === 'undefined') return
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  // 初回のみ: 保存された設定がなければ OS に合わせる
  if (!bgTheme || bgTheme === 'dark') {
    const initialTheme = prefersDark ? 'dark' : 'minimal-white'
    setBgTheme(initialTheme)
  }
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 2: 設定の永続化を接続**

DB初期化後に `getPreferences()` で設定を読み込み、各stateに反映。
設定変更時に `savePreferences()` で保存。

- [ ] **Step 3: PerformanceTier をインタラクションに接続**

```typescript
const perfTier = useFrameMonitor(items.length)

// perfTier に応じて tilt/spotlight/repulsion の有効/無効を決定
const enableTilt = perfTier === 'full' || perfTier === 'reduced-spotlight'
const enableSpotlight = perfTier === 'full'
const enableRepulsion = perfTier === 'full' || perfTier === 'reduced-spotlight'
const enableFloatAnimation = perfTier !== 'minimal'
```

- [ ] **Step 4: ビルド確認**

Run: `rtk next build`
Expected: 成功

- [ ] **Step 5: コミット**

```bash
git add app/(app)/board/board-client.tsx
git commit -m "feat(theme): wire theme-to-color-mode auto-mapping and preferences persistence"
```

---

## Task 19: 最終ビルド確認 + 全体動作確認

**Files:** なし（確認のみ）

- [ ] **Step 1: ビルド確認**

Run: `rtk next build`
Expected: 成功、エラーなし

- [ ] **Step 2: dev server で全機能確認**

Run: `npm run dev`

確認項目:
1. UIパネル（FolderNav, UrlInput等）にリキッドグラスが適用されている
2. カードホバーで3D tilt + spotlight が動作する
3. カードドラッグで周囲のカードが距離に応じて避ける
4. カードドロップ時にバウンス + 波紋が出る
5. 設定パネルで背景テーマ変更 → カラーモードが自動切替
6. 設定パネルでカードスタイル4種が切替可能
7. 設定パネルでUIモード（自動/ダーク/ライト）が独立動作
8. 新規カード追加時にランダムなサイズ/アスペクト比で配置される
9. カード右下のリサイズハンドルでサイズ変更可能
10. cardboard背景テーマが厚紙テクスチャで表示される
11. 設定がページリロード後も維持される（IndexedDB永続化）

- [ ] **Step 3: 最終コミット（必要な修正があれば）**

```bash
git add -A
git commit -m "fix: address issues found during S3 design polish QA"
```

---

## 完了条件チェックリスト

| 条件 | Task |
|------|------|
| globals.css にデザイントークン全定義 | Task 4, 8, 16 |
| prefers-color-scheme 初期値判定 + テーマ連動 + UIモード独立トグル | Task 15, 16, 18 |
| カードがリキッドグラス表現 | Task 1-3, 14 |
| UIパーツ全てにリキッドグラス適用 | Task 4 |
| 4種のカードスタイル切替 | Task 14 |
| カードサイズ/アスペクト比ランダム + カスタマイズ | Task 10, 11, 12, 13 |
| ホバー: 3D tilt + spotlight + 影連動 | Task 5, 6 |
| ドラッグ: 持ち上げ + 距離ベースリパルション | Task 7 |
| 着地: バウンス + 波紋 | Task 8 |
| 設定パネルで全設定切替 | Task 17 |
| 120fps維持（50枚カード） | Task 9, 18 |
| npm run build 通る | Task 19 |
| Inter/Outfit フォント読み込み | 既に完了 |
