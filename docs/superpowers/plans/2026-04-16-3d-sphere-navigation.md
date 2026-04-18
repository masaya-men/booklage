# 3D球体ナビゲーション Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 無限キャンバスを球面に変え、パンし続けると地球の裏側に回り込む3Dナビゲーションを、WebGL + CSS3D ハイブリッドで実現する。

**Architecture:** Three.jsのWebGLRendererとCSS3DRendererを同じシーンに重ねて使う。WebGL層が球体・ガラスシェーダー・ポストプロセスを担当し、CSS3D層がカードDOM要素を3D空間に配置する。既存の2Dキャンバスは平面モードとして完全に残し、ユーザーが切替可能にする。

**Tech Stack:** Three.js (WebGLRenderer + CSS3DRenderer), GLSL shaders, GSAP, React 19, TypeScript strict

**Design Spec:** `docs/superpowers/specs/2026-04-16-3d-sphere-navigation-design.md`

---

## File Structure

```
lib/
  sphere/
    sphere-projection.ts      — 2D ↔ 球面座標の変換（純粋関数）
    sphere-renderer.ts         — Three.js WebGL + CSS3D 初期化・レンダリング
    glass-shader.ts            — 物理ベース屈折ガラスGLSLシェーダー
    post-processing.ts         — ブルーム・DOF・ビネット
    sphere-culling.ts          — 球面版ビューポートカリング + LOD判定
    sphere-interaction.ts      — 球面回転・慣性・ズーム操作
    use-sphere-canvas.ts       — 球面キャンバスReactフック
  canvas/
    use-infinite-canvas.ts     — 既存（viewMode追加のみ）
components/
  board/
    SphereCanvas.tsx           — 球面モード用キャンバスコンポーネント
    ViewModeToggle.tsx         — 🌐/📋 切替ボタン
    Canvas.tsx                 — 既存（変更なし）
    board-client.tsx           — 既存（モード切替ロジック追加）
```

---

## Task 1: Three.jsインストール + 球面座標変換の数学

**Files:**
- Create: `lib/sphere/sphere-projection.ts`
- Test: `lib/sphere/__tests__/sphere-projection.test.ts`

- [ ] **Step 1: Three.jsをインストール**

```bash
pnpm add three
pnpm add -D @types/three
```

- [ ] **Step 2: テストファイルを作成**

```typescript
// lib/sphere/__tests__/sphere-projection.test.ts
import { describe, it, expect } from 'vitest'
import {
  uvToSphere,
  sphereToUv,
  worldToUv,
  uvToWorld,
  calculateSphereRadius,
  getAngularDistance,
} from '../sphere-projection'

describe('sphere-projection', () => {
  describe('uvToSphere / sphereToUv roundtrip', () => {
    it('converts UV (0.5, 0.5) to front of sphere and back', () => {
      const point = uvToSphere(0.5, 0.5, 500)
      // u=0.5, v=0.5 → theta=π, phi=π/2 → front center (0, 0, -500)
      expect(point.x).toBeCloseTo(0, 1)
      expect(point.y).toBeCloseTo(0, 1)
      expect(point.z).toBeCloseTo(-500, 1)
      const uv = sphereToUv(point.x, point.y, point.z, 500)
      expect(uv.u).toBeCloseTo(0.5, 5)
      expect(uv.v).toBeCloseTo(0.5, 5)
    })

    it('converts UV (0, 0) to top-back', () => {
      const point = uvToSphere(0, 0, 500)
      const uv = sphereToUv(point.x, point.y, point.z, 500)
      expect(uv.u).toBeCloseTo(0, 5)
      expect(uv.v).toBeCloseTo(0, 5)
    })

    it('converts UV (1, 1) and wraps', () => {
      const point = uvToSphere(1.0, 1.0, 500)
      const uv = sphereToUv(point.x, point.y, point.z, 500)
      expect(uv.u).toBeCloseTo(1.0, 3)
      expect(uv.v).toBeCloseTo(1.0, 3)
    })
  })

  describe('worldToUv / uvToWorld roundtrip', () => {
    it('converts world (0, 0) to UV center and back', () => {
      const uv = worldToUv(0, 0, 1000, 1000)
      expect(uv.u).toBeCloseTo(0.5, 5)
      expect(uv.v).toBeCloseTo(0.5, 5)
      const world = uvToWorld(uv.u, uv.v, 1000, 1000)
      expect(world.x).toBeCloseTo(0, 1)
      expect(world.y).toBeCloseTo(0, 1)
    })

    it('converts world (500, 250) and back', () => {
      const uv = worldToUv(500, 250, 2000, 2000)
      const world = uvToWorld(uv.u, uv.v, 2000, 2000)
      expect(world.x).toBeCloseTo(500, 1)
      expect(world.y).toBeCloseTo(250, 1)
    })
  })

  describe('calculateSphereRadius', () => {
    it('returns minimum radius for 0 cards', () => {
      const r = calculateSphereRadius(0)
      expect(r).toBeGreaterThan(0)
    })

    it('increases radius with more cards', () => {
      const r10 = calculateSphereRadius(10)
      const r100 = calculateSphereRadius(100)
      const r1000 = calculateSphereRadius(1000)
      expect(r100).toBeGreaterThan(r10)
      expect(r1000).toBeGreaterThan(r100)
    })

    it('scales sublinearly (not proportional to card count)', () => {
      const r100 = calculateSphereRadius(100)
      const r1000 = calculateSphereRadius(1000)
      // 10x cards should NOT = 10x radius
      expect(r1000 / r100).toBeLessThan(5)
    })
  })

  describe('getAngularDistance', () => {
    it('returns 0 for same point', () => {
      const d = getAngularDistance(0.5, 0.5, 0.5, 0.5)
      expect(d).toBeCloseTo(0, 5)
    })

    it('returns π for opposite points', () => {
      // (0.5, 0.5) = front, (0.5, 0) = back (approximately)
      const d = getAngularDistance(0.5, 0.5, 0.5, 0.0)
      expect(d).toBeCloseTo(Math.PI / 2, 1)
    })

    it('returns value between 0 and π', () => {
      const d = getAngularDistance(0.3, 0.7, 0.8, 0.2)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(Math.PI)
    })
  })
})
```

- [ ] **Step 3: テストを実行して失敗を確認**

```bash
rtk vitest run lib/sphere/__tests__/sphere-projection.test.ts
```

Expected: FAIL — モジュールが存在しない

- [ ] **Step 4: 球面座標変換を実装**

```typescript
// lib/sphere/sphere-projection.ts

/**
 * 球面射影の数学ユーティリティ
 *
 * 座標系:
 * - World: 2Dキャンバス座標 (x, y) — 今のカード位置と同じ
 * - UV: 正規化座標 (u, v) ∈ [0,1] — 球面全体をマッピング
 * - Sphere: 3D直交座標 (x, y, z) — Three.jsの3D空間
 *
 * UV → Sphere の変換:
 *   theta = u * 2π  (経度、0〜2π)
 *   phi = v * π     (緯度、0〜π、北極〜南極)
 *   x = r * sin(phi) * sin(theta)
 *   y = r * cos(phi)
 *   z = -r * sin(phi) * cos(theta)
 */

/** UV座標 (0〜1) から球面3D座標への変換 */
export function uvToSphere(
  u: number,
  v: number,
  radius: number,
): { x: number; y: number; z: number } {
  const theta = u * Math.PI * 2
  const phi = v * Math.PI
  const sinPhi = Math.sin(phi)
  return {
    x: radius * sinPhi * Math.sin(theta),
    y: radius * Math.cos(phi),
    z: -radius * sinPhi * Math.cos(theta),
  }
}

/** 球面3D座標からUV座標への逆変換 */
export function sphereToUv(
  x: number,
  y: number,
  z: number,
  radius: number,
): { u: number; v: number } {
  const phi = Math.acos(Math.max(-1, Math.min(1, y / radius)))
  const sinPhi = Math.sin(phi)
  let theta: number
  if (Math.abs(sinPhi) < 1e-10) {
    theta = 0
  } else {
    theta = Math.atan2(x / (radius * sinPhi), -z / (radius * sinPhi))
    if (theta < 0) theta += Math.PI * 2
  }
  return {
    u: theta / (Math.PI * 2),
    v: phi / Math.PI,
  }
}

/**
 * ワールド座標 (2Dキャンバス) → UV座標
 * worldSpan = 球面が覆う2Dワールドの幅/高さ
 */
export function worldToUv(
  worldX: number,
  worldY: number,
  worldSpanX: number,
  worldSpanY: number,
): { u: number; v: number } {
  return {
    u: (worldX / worldSpanX) + 0.5,
    v: (worldY / worldSpanY) + 0.5,
  }
}

/** UV座標 → ワールド座標 (2Dキャンバス) */
export function uvToWorld(
  u: number,
  v: number,
  worldSpanX: number,
  worldSpanY: number,
): { x: number; y: number } {
  return {
    x: (u - 0.5) * worldSpanX,
    y: (v - 0.5) * worldSpanY,
  }
}

/**
 * カード枚数に応じた球の半径を計算
 * 表面積 ∝ カード枚数 × カード平均面積 × 余白係数
 * r = sqrt(n * avgArea * spacingFactor / (4π))
 */
const MIN_RADIUS = 800
const AVG_CARD_AREA = 280 * 200  // 平均カードサイズ（ピクセル²）
const SPACING_FACTOR = 4         // カード間の余白倍率

export function calculateSphereRadius(cardCount: number): number {
  if (cardCount <= 0) return MIN_RADIUS
  const surfaceNeeded = cardCount * AVG_CARD_AREA * SPACING_FACTOR
  const radius = Math.sqrt(surfaceNeeded / (4 * Math.PI))
  return Math.max(MIN_RADIUS, radius)
}

/**
 * 2つのUV座標間の角距離（ラジアン）
 * 球面上の大円距離 — ビューポートカリングに使用
 */
export function getAngularDistance(
  u1: number,
  v1: number,
  u2: number,
  v2: number,
): number {
  const theta1 = u1 * Math.PI * 2
  const phi1 = v1 * Math.PI
  const theta2 = u2 * Math.PI * 2
  const phi2 = v2 * Math.PI

  // 3D単位ベクトルの内積
  const dot =
    Math.sin(phi1) * Math.sin(phi2) * Math.cos(theta1 - theta2) +
    Math.cos(phi1) * Math.cos(phi2)

  return Math.acos(Math.max(-1, Math.min(1, dot)))
}
```

- [ ] **Step 5: テストを実行して全て通ることを確認**

```bash
rtk vitest run lib/sphere/__tests__/sphere-projection.test.ts
```

Expected: PASS — 全テスト通過

- [ ] **Step 6: コミット**

```bash
git add lib/sphere/sphere-projection.ts lib/sphere/__tests__/sphere-projection.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add sphere projection math + install three.js"
```

---

## Task 2: 球面版ビューポートカリング + LOD

**Files:**
- Create: `lib/sphere/sphere-culling.ts`
- Test: `lib/sphere/__tests__/sphere-culling.test.ts`

- [ ] **Step 1: テストファイルを作成**

```typescript
// lib/sphere/__tests__/sphere-culling.test.ts
import { describe, it, expect } from 'vitest'
import {
  getLodLevel,
  getVisibleCards,
  type LodLevel,
  type SphereCard,
} from '../sphere-culling'

describe('sphere-culling', () => {
  describe('getLodLevel', () => {
    it('returns "full" for cards directly in front', () => {
      expect(getLodLevel(0)).toBe('full')
      expect(getLodLevel(0.3)).toBe('full')
    })

    it('returns "reduced" for cards at an angle', () => {
      expect(getLodLevel(1.0)).toBe('reduced')
    })

    it('returns "dot" for cards near the back', () => {
      expect(getLodLevel(1.8)).toBe('dot')
    })

    it('returns "hidden" for cards behind', () => {
      expect(getLodLevel(2.5)).toBe('hidden')
    })
  })

  describe('getVisibleCards', () => {
    const cards: SphereCard[] = [
      { id: 'front', u: 0.5, v: 0.5, width: 280, height: 200 },
      { id: 'side', u: 0.7, v: 0.5, width: 280, height: 200 },
      { id: 'back', u: 0.0, v: 0.5, width: 280, height: 200 },
    ]

    it('assigns correct LOD levels based on camera UV', () => {
      const result = getVisibleCards(cards, 0.5, 0.5, 1.0)
      const front = result.find(c => c.id === 'front')
      const back = result.find(c => c.id === 'back')
      expect(front?.lod).toBe('full')
      expect(back?.lod).toBe('hidden')
    })

    it('excludes hidden cards from result', () => {
      const result = getVisibleCards(cards, 0.5, 0.5, 1.0)
      const hidden = result.filter(c => c.lod === 'hidden')
      expect(hidden).toHaveLength(0)
    })

    it('adjusts thresholds based on zoom', () => {
      // Zoomed in = narrower field of view = fewer full-LOD cards
      const zoomedIn = getVisibleCards(cards, 0.5, 0.5, 2.0)
      const zoomedOut = getVisibleCards(cards, 0.5, 0.5, 0.3)
      const fullIn = zoomedIn.filter(c => c.lod === 'full').length
      const fullOut = zoomedOut.filter(c => c.lod === 'full').length
      expect(fullOut).toBeGreaterThanOrEqual(fullIn)
    })
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
rtk vitest run lib/sphere/__tests__/sphere-culling.test.ts
```

Expected: FAIL

- [ ] **Step 3: カリング + LODロジックを実装**

```typescript
// lib/sphere/sphere-culling.ts
import { getAngularDistance } from './sphere-projection'

export type LodLevel = 'full' | 'reduced' | 'dot' | 'hidden'

export interface SphereCard {
  id: string
  u: number
  v: number
  width: number
  height: number
}

export interface VisibleSphereCard extends SphereCard {
  lod: Exclude<LodLevel, 'hidden'>
  angularDistance: number
  opacity: number
}

/**
 * 角距離に基づいてLODレベルを決定
 *
 * | 段階      | 角距離 (rad) | 角度    | 表示方法            |
 * |-----------|-------------|---------|-------------------|
 * | full      | 0 〜 π/4   | 0°〜45° | フルDOM            |
 * | reduced   | π/4 〜 5π/12 | 45°〜75° | DOM + ブラー       |
 * | dot       | 5π/12 〜 2π/3 | 75°〜120° | WebGLドット      |
 * | hidden    | 2π/3 〜 π   | 120°〜180° | 非表示           |
 */
const THRESHOLD_FULL = Math.PI / 4        // 45°
const THRESHOLD_REDUCED = (5 * Math.PI) / 12  // 75°
const THRESHOLD_DOT = (2 * Math.PI) / 3  // 120°

export function getLodLevel(angularDistance: number): LodLevel {
  if (angularDistance <= THRESHOLD_FULL) return 'full'
  if (angularDistance <= THRESHOLD_REDUCED) return 'reduced'
  if (angularDistance <= THRESHOLD_DOT) return 'dot'
  return 'hidden'
}

/**
 * 可視カードのリストを返す（hidden除外）
 *
 * @param cards 全カードの球面座標
 * @param cameraU カメラが向いている方向のU座標
 * @param cameraV カメラが向いている方向のV座標
 * @param zoom ズームレベル（大きいほどFOVが狭い）
 */
export function getVisibleCards(
  cards: ReadonlyArray<SphereCard>,
  cameraU: number,
  cameraV: number,
  zoom: number,
): VisibleSphereCard[] {
  // ズームが大きいほどFOVが狭い → thresholdを狭める
  // ズームが小さいほどFOVが広い → thresholdを広げる
  const zoomFactor = Math.max(0.3, Math.min(3.0, 1.0 / zoom))
  const adjustedFull = THRESHOLD_FULL * zoomFactor
  const adjustedReduced = THRESHOLD_REDUCED * zoomFactor
  const adjustedDot = THRESHOLD_DOT * zoomFactor

  const result: VisibleSphereCard[] = []

  for (const card of cards) {
    const dist = getAngularDistance(cameraU, cameraV, card.u, card.v)

    let lod: LodLevel
    if (dist <= adjustedFull) lod = 'full'
    else if (dist <= adjustedReduced) lod = 'reduced'
    else if (dist <= adjustedDot) lod = 'dot'
    else lod = 'hidden'

    if (lod === 'hidden') continue

    // opacity: fullは1.0、端に向かってフェードアウト
    let opacity: number
    if (lod === 'full') {
      opacity = 1.0
    } else if (lod === 'reduced') {
      const t = (dist - adjustedFull) / (adjustedReduced - adjustedFull)
      opacity = 1.0 - t * 0.5  // 1.0 → 0.5
    } else {
      const t = (dist - adjustedReduced) / (adjustedDot - adjustedReduced)
      opacity = 0.5 - t * 0.4  // 0.5 → 0.1
    }

    result.push({
      ...card,
      lod: lod as Exclude<LodLevel, 'hidden'>,
      angularDistance: dist,
      opacity,
    })
  }

  return result
}
```

- [ ] **Step 4: テストを実行して通ることを確認**

```bash
rtk vitest run lib/sphere/__tests__/sphere-culling.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/sphere/sphere-culling.ts lib/sphere/__tests__/sphere-culling.test.ts
git commit -m "feat: add sphere culling + LOD system"
```

---

## Task 3: 球面インタラクション（回転・慣性・ズーム）

**Files:**
- Create: `lib/sphere/sphere-interaction.ts`
- Test: `lib/sphere/__tests__/sphere-interaction.test.ts`

- [ ] **Step 1: テストファイルを作成**

```typescript
// lib/sphere/__tests__/sphere-interaction.test.ts
import { describe, it, expect } from 'vitest'
import {
  applyRotation,
  calculateInertia,
  calculateZoomCurvature,
  wrapUv,
} from '../sphere-interaction'

describe('sphere-interaction', () => {
  describe('applyRotation', () => {
    it('moves camera UV based on drag delta', () => {
      const result = applyRotation(0.5, 0.5, 100, 0, 1000, 1.0)
      expect(result.u).toBeLessThan(0.5) // dragging right moves camera left
      expect(result.v).toBeCloseTo(0.5, 5)
    })

    it('scales rotation by zoom level', () => {
      const slow = applyRotation(0.5, 0.5, 100, 0, 1000, 2.0)
      const fast = applyRotation(0.5, 0.5, 100, 0, 1000, 0.5)
      // Higher zoom = less rotation per pixel
      const slowDelta = Math.abs(slow.u - 0.5)
      const fastDelta = Math.abs(fast.u - 0.5)
      expect(fastDelta).toBeGreaterThan(slowDelta)
    })
  })

  describe('wrapUv', () => {
    it('wraps u beyond 1 to 0+remainder', () => {
      expect(wrapUv(1.3).u).toBeCloseTo(0.3, 5)
    })

    it('wraps u below 0 to 1-remainder', () => {
      expect(wrapUv(-0.2).u).toBeCloseTo(0.8, 5)
    })

    it('clamps v to [0.05, 0.95] to avoid poles', () => {
      expect(wrapUv(0.5, -0.1).v).toBeCloseTo(0.05, 5)
      expect(wrapUv(0.5, 1.2).v).toBeCloseTo(0.95, 5)
    })
  })

  describe('calculateInertia', () => {
    it('returns velocity from recent drag history', () => {
      const history = [
        { u: 0.5, v: 0.5, time: 0 },
        { u: 0.48, v: 0.5, time: 16 },
        { u: 0.46, v: 0.5, time: 32 },
      ]
      const vel = calculateInertia(history)
      expect(vel.du).toBeLessThan(0)  // moving left
      expect(Math.abs(vel.dv)).toBeLessThan(0.001) // not moving vertically
    })

    it('returns zero for empty history', () => {
      const vel = calculateInertia([])
      expect(vel.du).toBe(0)
      expect(vel.dv).toBe(0)
    })
  })

  describe('calculateZoomCurvature', () => {
    it('returns 0 curvature at max zoom', () => {
      const c = calculateZoomCurvature(3.0)
      expect(c).toBeCloseTo(0, 1)
    })

    it('returns 1 curvature at min zoom', () => {
      const c = calculateZoomCurvature(0.1)
      expect(c).toBeCloseTo(1, 1)
    })

    it('returns intermediate curvature at default zoom', () => {
      const c = calculateZoomCurvature(1.0)
      expect(c).toBeGreaterThan(0)
      expect(c).toBeLessThan(1)
    })
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
rtk vitest run lib/sphere/__tests__/sphere-interaction.test.ts
```

Expected: FAIL

- [ ] **Step 3: インタラクションロジックを実装**

```typescript
// lib/sphere/sphere-interaction.ts

/**
 * 球面インタラクション — 回転・慣性・ズーム
 *
 * カメラの向きをUV座標 (u, v) で管理。
 * u: 経度方向 (0〜1、一周して戻る)
 * v: 緯度方向 (0.05〜0.95、極は制限)
 */

interface DragSample {
  u: number
  v: number
  time: number
}

/** ドラッグのピクセル移動をUV回転量に変換 */
export function applyRotation(
  currentU: number,
  currentV: number,
  deltaX: number,
  deltaY: number,
  sphereRadius: number,
  zoom: number,
): { u: number; v: number } {
  // 球の円周 = 2πr、ピクセル→UV変換
  const circumference = 2 * Math.PI * sphereRadius
  const sensitivity = 1.0 / zoom  // ズームインすると回転が遅くなる
  const du = -(deltaX / circumference) * sensitivity
  const dv = -(deltaY / (circumference / 2)) * sensitivity
  return wrapUv(currentU + du, currentV + dv)
}

/** UV座標をラップ（一周処理 + 極制限） */
export function wrapUv(u: number, v?: number): { u: number; v: number } {
  let wrappedU = u % 1
  if (wrappedU < 0) wrappedU += 1

  const V_MIN = 0.05  // 北極付近を制限
  const V_MAX = 0.95  // 南極付近を制限
  const wrappedV = v !== undefined
    ? Math.max(V_MIN, Math.min(V_MAX, v))
    : 0.5

  return { u: wrappedU, v: wrappedV }
}

/** ドラッグ履歴から慣性速度を計算 */
export function calculateInertia(
  history: ReadonlyArray<DragSample>,
): { du: number; dv: number } {
  if (history.length < 2) return { du: 0, dv: 0 }

  // 直近の2サンプルから速度を計算
  const last = history[history.length - 1]
  const prev = history[history.length - 2]
  const dt = last.time - prev.time
  if (dt <= 0) return { du: 0, dv: 0 }

  // per-millisecond velocity
  return {
    du: (last.u - prev.u) / dt,
    dv: (last.v - prev.v) / dt,
  }
}

/**
 * ズームレベルから球面の曲率係数を計算
 *
 * zoom=最大 → curvature=0 (完全な平面)
 * zoom=最小 → curvature=1 (完全な球面)
 * zoom=1.0  → 中間の曲率
 */
const ZOOM_MIN = 0.1
const ZOOM_MAX = 3.0

export function calculateZoomCurvature(zoom: number): number {
  const t = (zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)
  const clamped = Math.max(0, Math.min(1, t))
  // easeOutQuad: ズームアウト時に曲率が急速に上がる
  return 1 - clamped * clamped
}
```

- [ ] **Step 4: テストを実行して通ることを確認**

```bash
rtk vitest run lib/sphere/__tests__/sphere-interaction.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/sphere/sphere-interaction.ts lib/sphere/__tests__/sphere-interaction.test.ts
git commit -m "feat: add sphere interaction logic (rotation, inertia, zoom)"
```

---

## Task 4: ガラスシェーダー（物理ベース屈折）

**Files:**
- Create: `lib/sphere/glass-shader.ts`

- [ ] **Step 1: GLSLガラスシェーダーを実装**

```typescript
// lib/sphere/glass-shader.ts
import * as THREE from 'three'

/**
 * 物理ベース屈折ガラスシェーダー
 *
 * 参考: Maxime Heckel の refraction shader
 * - 透明度最優先: ガラスの色はほぼゼロ
 * - 大きな屈折歪み: 背景がぐにゃっと歪む
 * - フレネル反射: 見る角度で反射率が変わる
 * - 色収差: RGBがわずかにズレてプリズム効果
 */

export const glassVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

export const glassFragmentShader = /* glsl */ `
  uniform sampler2D uSceneTexture;
  uniform vec2 uResolution;
  uniform float uIor;
  uniform float uChromaticAberration;
  uniform float uFresnelPower;
  uniform float uDistortionStrength;
  uniform vec3 uCameraPosition;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  float fresnel(vec3 viewDir, vec3 normal, float power) {
    return pow(1.0 - max(dot(viewDir, normal), 0.0), power);
  }

  vec2 getRefractedUv(vec3 viewDir, vec3 normal, float ior, vec2 screenUv) {
    vec3 refracted = refract(viewDir, normal, 1.0 / ior);
    vec2 offset = refracted.xy * uDistortionStrength;
    return screenUv + offset;
  }

  void main() {
    vec2 screenUv = gl_FragCoord.xy / uResolution;
    vec3 viewDir = normalize(vWorldPosition - uCameraPosition);
    vec3 normal = normalize(vWorldNormal);

    // 色収差: RGB各チャンネルで異なるIORで屈折
    float iorR = uIor - uChromaticAberration;
    float iorG = uIor;
    float iorB = uIor + uChromaticAberration;

    vec2 uvR = getRefractedUv(viewDir, normal, iorR, screenUv);
    vec2 uvG = getRefractedUv(viewDir, normal, iorG, screenUv);
    vec2 uvB = getRefractedUv(viewDir, normal, iorB, screenUv);

    float r = texture2D(uSceneTexture, uvR).r;
    float g = texture2D(uSceneTexture, uvG).g;
    float b = texture2D(uSceneTexture, uvB).b;

    vec3 refractedColor = vec3(r, g, b);

    // フレネル反射
    float fresnelFactor = fresnel(-viewDir, normal, uFresnelPower);
    vec3 reflectedColor = vec3(1.0, 1.0, 1.0) * 0.1; // 微かな白い反射

    // 透明度最優先: ほぼ屈折色のみ、フレネルで僅かに反射
    vec3 finalColor = mix(refractedColor, reflectedColor, fresnelFactor * 0.3);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`

/** ガラスマテリアルを生成 */
export function createGlassMaterial(
  sceneTexture: THREE.Texture,
  resolution: THREE.Vector2,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: glassVertexShader,
    fragmentShader: glassFragmentShader,
    uniforms: {
      uSceneTexture: { value: sceneTexture },
      uResolution: { value: resolution },
      uIor: { value: 1.15 },                   // 屈折率（ガラス ≈ 1.5、水 ≈ 1.33、控えめ ≈ 1.15）
      uChromaticAberration: { value: 0.03 },    // 色収差の強さ
      uFresnelPower: { value: 3.0 },            // フレネル指数
      uDistortionStrength: { value: 0.15 },     // 歪みの大きさ（大きいほどぐにゃっとする）
      uCameraPosition: { value: new THREE.Vector3() },
    },
    transparent: true,
    side: THREE.FrontSide,
  })
}

/** ガラスシェーダーのuniformsを更新 */
export function updateGlassUniforms(
  material: THREE.ShaderMaterial,
  camera: THREE.Camera,
  resolution: THREE.Vector2,
): void {
  material.uniforms.uCameraPosition.value.copy(camera.position)
  material.uniforms.uResolution.value.copy(resolution)
}
```

- [ ] **Step 2: コミット**

```bash
git add lib/sphere/glass-shader.ts
git commit -m "feat: add physical glass refraction shader (IOR, chromatic aberration, fresnel)"
```

---

## Task 5: ポストプロセス（ブルーム・DOF・ビネット）

**Files:**
- Create: `lib/sphere/post-processing.ts`

- [ ] **Step 1: ポストプロセスパイプラインを実装**

```typescript
// lib/sphere/post-processing.ts
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

/**
 * ポストプロセスパイプライン
 * - ブルーム: 光源やガラスの反射が柔らかく光る
 * - ビネット: 画面端が少し暗くなり没入感アップ
 *
 * DOFはパフォーマンスを見て後から追加可能（LODのblurで代替）
 */

const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uIntensity: { value: 0.4 },
    uSmoothness: { value: 0.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uSmoothness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float dist = distance(vUv, vec2(0.5));
      float vignette = smoothstep(0.5, 0.5 - uSmoothness, dist);
      color.rgb *= mix(1.0 - uIntensity, 1.0, vignette);
      gl_FragColor = color;
    }
  `,
}

export interface PostProcessingPipeline {
  composer: EffectComposer
  bloomPass: UnrealBloomPass
  vignettePass: ShaderPass
  resize: (width: number, height: number) => void
  dispose: () => void
}

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostProcessingPipeline {
  const composer = new EffectComposer(renderer)

  // 1. シーンレンダリング
  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  // 2. ブルーム（控えめ — ガラスの反射が光る程度）
  const size = renderer.getSize(new THREE.Vector2())
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.3,    // strength — 控えめ
    0.6,    // radius
    0.8,    // threshold — 明るい部分のみ
  )
  composer.addPass(bloomPass)

  // 3. ビネット
  const vignettePass = new ShaderPass(vignetteShader)
  composer.addPass(vignettePass)

  return {
    composer,
    bloomPass,
    vignettePass,
    resize(width: number, height: number): void {
      composer.setSize(width, height)
      bloomPass.resolution.set(width, height)
    },
    dispose(): void {
      composer.dispose()
    },
  }
}
```

- [ ] **Step 2: コミット**

```bash
git add lib/sphere/post-processing.ts
git commit -m "feat: add post-processing pipeline (bloom + vignette)"
```

---

## Task 6: 球面レンダラー（WebGL + CSS3D セットアップ）

**Files:**
- Create: `lib/sphere/sphere-renderer.ts`

- [ ] **Step 1: Three.js WebGL + CSS3D デュアルレンダラーを実装**

```typescript
// lib/sphere/sphere-renderer.ts
import * as THREE from 'three'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { uvToSphere, calculateSphereRadius } from './sphere-projection'
import { createGlassMaterial, updateGlassUniforms } from './glass-shader'
import { createPostProcessing, type PostProcessingPipeline } from './post-processing'

export interface SphereRendererConfig {
  container: HTMLElement
  width: number
  height: number
  cardCount: number
}

export interface CardPlacement {
  id: string
  u: number
  v: number
  element: HTMLElement
}

export interface SphereRenderer {
  /** カメラの向き (UV座標) を更新 */
  setCameraDirection: (u: number, v: number) => void
  /** ズームレベルを設定 */
  setZoom: (zoom: number) => void
  /** カードDOM要素を球面上に配置 */
  placeCard: (placement: CardPlacement) => CSS3DObject
  /** カードを除去 */
  removeCard: (id: string) => void
  /** 球の半径を更新（カード数変更時） */
  updateRadius: (cardCount: number) => void
  /** 毎フレーム描画 */
  render: () => void
  /** リサイズ */
  resize: (width: number, height: number) => void
  /** クリーンアップ */
  dispose: () => void
  /** 現在の球の半径 */
  getRadius: () => number
  /** Three.jsカメラ参照 */
  getCamera: () => THREE.PerspectiveCamera
}

export function createSphereRenderer(config: SphereRendererConfig): SphereRenderer {
  const { container, width, height, cardCount } = config

  let radius = calculateSphereRadius(cardCount)
  const cameraDistance = radius * 2.5

  // — Scene & Camera —
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, width / height, 1, radius * 10)
  camera.position.set(0, 0, cameraDistance)
  camera.lookAt(0, 0, 0)

  // — WebGL Renderer (下層: 球体・ガラス・ポストプロセス) —
  const webglRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  webglRenderer.setSize(width, height)
  webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  webglRenderer.domElement.style.position = 'absolute'
  webglRenderer.domElement.style.top = '0'
  webglRenderer.domElement.style.left = '0'
  webglRenderer.domElement.style.pointerEvents = 'none'
  container.appendChild(webglRenderer.domElement)

  // — CSS3D Renderer (上層: カードDOM) —
  const css3dRenderer = new CSS3DRenderer()
  css3dRenderer.setSize(width, height)
  css3dRenderer.domElement.style.position = 'absolute'
  css3dRenderer.domElement.style.top = '0'
  css3dRenderer.domElement.style.left = '0'
  container.appendChild(css3dRenderer.domElement)

  // — Ambient atmosphere glow (球体の存在を示す薄い光) —
  const glowGeometry = new THREE.SphereGeometry(radius * 1.02, 64, 64)
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.03,
    side: THREE.BackSide,
  })
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial)
  scene.add(glowMesh)

  // — ポストプロセス —
  const postProcessing = createPostProcessing(webglRenderer, scene, camera)

  // — 裏側カード用パーティクル —
  const dotGeometry = new THREE.BufferGeometry()
  const dotMaterial = new THREE.PointsMaterial({
    size: 4,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  })
  const dotPoints = new THREE.Points(dotGeometry, dotMaterial)
  scene.add(dotPoints)

  // — カードCSS3Dオブジェクト管理 —
  const css3dObjects = new Map<string, CSS3DObject>()

  // — カメラ方向 (UV) —
  let cameraU = 0.5
  let cameraV = 0.5

  function updateCameraPosition(): void {
    const target = uvToSphere(cameraU, cameraV, radius)
    // カメラは球の外側から中心を見る
    const dir = new THREE.Vector3(target.x, target.y, target.z).normalize()
    camera.position.copy(dir.multiplyScalar(cameraDistance))
    camera.lookAt(0, 0, 0)
  }

  function setCameraDirection(u: number, v: number): void {
    cameraU = u
    cameraV = v
    updateCameraPosition()
  }

  function setZoom(zoom: number): void {
    camera.fov = 60 / zoom
    camera.updateProjectionMatrix()
  }

  function placeCard(placement: CardPlacement): CSS3DObject {
    const pos = uvToSphere(placement.u, placement.v, radius)
    const obj = new CSS3DObject(placement.element)
    obj.position.set(pos.x, pos.y, pos.z)

    // カードを球面の法線方向に向ける（外側を向く）
    const normal = new THREE.Vector3(pos.x, pos.y, pos.z).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    const right = new THREE.Vector3().crossVectors(up, normal).normalize()
    const correctedUp = new THREE.Vector3().crossVectors(normal, right).normalize()
    const matrix = new THREE.Matrix4().makeBasis(right, correctedUp, normal)
    obj.quaternion.setFromRotationMatrix(matrix)

    obj.scale.set(0.5, 0.5, 0.5) // CSS3DRendererのスケール調整

    css3dObjects.set(placement.id, obj)
    scene.add(obj)
    return obj
  }

  function removeCard(id: string): void {
    const obj = css3dObjects.get(id)
    if (obj) {
      scene.remove(obj)
      css3dObjects.delete(id)
    }
  }

  function updateRadius(newCardCount: number): void {
    radius = calculateSphereRadius(newCardCount)
    // glowMeshスケール更新
    glowMesh.geometry.dispose()
    glowMesh.geometry = new THREE.SphereGeometry(radius * 1.02, 64, 64)
    updateCameraPosition()
  }

  function render(): void {
    postProcessing.composer.render()
    css3dRenderer.render(scene, camera)
  }

  function resize(w: number, h: number): void {
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    webglRenderer.setSize(w, h)
    css3dRenderer.setSize(w, h)
    postProcessing.resize(w, h)
  }

  function dispose(): void {
    postProcessing.dispose()
    webglRenderer.dispose()
    glowGeometry.dispose()
    glowMaterial.dispose()
    dotGeometry.dispose()
    dotMaterial.dispose()
    css3dObjects.clear()
    container.removeChild(webglRenderer.domElement)
    container.removeChild(css3dRenderer.domElement)
  }

  updateCameraPosition()

  return {
    setCameraDirection,
    setZoom,
    placeCard,
    removeCard,
    updateRadius,
    render,
    resize,
    dispose,
    getRadius: () => radius,
    getCamera: () => camera,
  }
}
```

- [ ] **Step 2: コミット**

```bash
git add lib/sphere/sphere-renderer.ts
git commit -m "feat: add sphere renderer (WebGL + CSS3D dual renderer)"
```

---

## Task 7: 球面キャンバスReactフック

**Files:**
- Create: `lib/sphere/use-sphere-canvas.ts`

- [ ] **Step 1: フックを実装**

```typescript
// lib/sphere/use-sphere-canvas.ts
'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import { createSphereRenderer, type SphereRenderer, type CardPlacement } from './sphere-renderer'
import { applyRotation, wrapUv, calculateInertia, calculateZoomCurvature } from './sphere-interaction'
import { getVisibleCards, type SphereCard, type VisibleSphereCard } from './sphere-culling'
import { worldToUv } from './sphere-projection'

export interface SphereCanvasControls {
  /** コンテナDOMにアタッチするref */
  containerRef: React.RefCallback<HTMLElement>
  /** カメラの向き (UV) */
  cameraU: number
  cameraV: number
  /** ズームレベル */
  zoom: number
  /** 可視カードリスト（LOD付き） */
  visibleCards: VisibleSphereCard[]
  /** カードを球面に配置 */
  placeCard: (placement: CardPlacement) => void
  /** カードを除去 */
  removeCard: (id: string) => void
  /** 球の半径を更新 */
  updateRadius: (cardCount: number) => void
  /** 球面が回転中か */
  isRotating: boolean
}

export function useSphereCanvas(
  cards: ReadonlyArray<SphereCard>,
): SphereCanvasControls {
  const rendererRef = useRef<SphereRenderer | null>(null)
  const containerElRef = useRef<HTMLElement | null>(null)
  const animFrameRef = useRef<number>(0)

  // カメラ状態
  const [cameraU, setCameraU] = useState(0.5)
  const [cameraV, setCameraV] = useState(0.5)
  const [zoom, setZoom] = useState(1.0)
  const [isRotating, setIsRotating] = useState(false)
  const [visibleCards, setVisibleCards] = useState<VisibleSphereCard[]>([])

  // ドラッグ状態 (refs for performance)
  const isDraggingRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const dragHistoryRef = useRef<Array<{ u: number; v: number; time: number }>>([])
  const cameraRef = useRef({ u: 0.5, v: 0.5 })
  const zoomRef = useRef(1.0)

  // カリング更新
  useEffect(() => {
    const visible = getVisibleCards(cards, cameraU, cameraV, zoom)
    setVisibleCards(visible)
  }, [cards, cameraU, cameraV, zoom])

  // レンダーループ
  useEffect(() => {
    let inertiaU = 0
    let inertiaV = 0
    const FRICTION = 0.95

    function animate(): void {
      animFrameRef.current = requestAnimationFrame(animate)

      // 慣性処理
      if (!isDraggingRef.current && (Math.abs(inertiaU) > 0.00001 || Math.abs(inertiaV) > 0.00001)) {
        const wrapped = wrapUv(cameraRef.current.u + inertiaU * 16, cameraRef.current.v + inertiaV * 16)
        cameraRef.current = wrapped
        setCameraU(wrapped.u)
        setCameraV(wrapped.v)
        rendererRef.current?.setCameraDirection(wrapped.u, wrapped.v)
        inertiaU *= FRICTION
        inertiaV *= FRICTION
        setIsRotating(true)
      } else if (!isDraggingRef.current) {
        setIsRotating(false)
      }

      rendererRef.current?.render()
    }

    animate()

    // 慣性セッター (ドラッグ終了時に呼ばれる)
    const setInertia = (du: number, dv: number): void => {
      inertiaU = du
      inertiaV = dv
    }

    // コンテナのイベントハンドラーを設定
    const el = containerElRef.current
    if (!el) return

    const handlePointerDown = (e: PointerEvent): void => {
      // 左クリック（空きスペース）またはSpace押下中またはミドルクリック
      if (e.button === 0 || e.button === 1) {
        isDraggingRef.current = true
        lastPointerRef.current = { x: e.clientX, y: e.clientY }
        dragHistoryRef.current = [{ u: cameraRef.current.u, v: cameraRef.current.v, time: performance.now() }]
        inertiaU = 0
        inertiaV = 0
        setIsRotating(true)
        el.setPointerCapture(e.pointerId)
      }
    }

    const handlePointerMove = (e: PointerEvent): void => {
      if (!isDraggingRef.current || !rendererRef.current) return
      const dx = e.clientX - lastPointerRef.current.x
      const dy = e.clientY - lastPointerRef.current.y
      lastPointerRef.current = { x: e.clientX, y: e.clientY }

      const result = applyRotation(
        cameraRef.current.u,
        cameraRef.current.v,
        dx, dy,
        rendererRef.current.getRadius(),
        zoomRef.current,
      )
      cameraRef.current = result
      setCameraU(result.u)
      setCameraV(result.v)
      rendererRef.current.setCameraDirection(result.u, result.v)

      // ドラッグ履歴記録（慣性計算用）
      dragHistoryRef.current.push({ u: result.u, v: result.v, time: performance.now() })
      if (dragHistoryRef.current.length > 5) dragHistoryRef.current.shift()
    }

    const handlePointerUp = (): void => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false

      const vel = calculateInertia(dragHistoryRef.current)
      setInertia(vel.du, vel.dv)
    }

    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.1, Math.min(3.0, zoomRef.current * delta))
      zoomRef.current = newZoom
      setZoom(newZoom)
      rendererRef.current?.setZoom(newZoom)
    }

    el.addEventListener('pointerdown', handlePointerDown)
    el.addEventListener('pointermove', handlePointerMove)
    el.addEventListener('pointerup', handlePointerUp)
    el.addEventListener('pointercancel', handlePointerUp)
    el.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      el.removeEventListener('pointerdown', handlePointerDown)
      el.removeEventListener('pointermove', handlePointerMove)
      el.removeEventListener('pointerup', handlePointerUp)
      el.removeEventListener('pointercancel', handlePointerUp)
      el.removeEventListener('wheel', handleWheel)
    }
  }, [])

  // コンテナrefコールバック
  const containerRef = useCallback((el: HTMLElement | null) => {
    // クリーンアップ
    if (rendererRef.current) {
      rendererRef.current.dispose()
      rendererRef.current = null
    }

    if (!el) {
      containerElRef.current = null
      return
    }

    containerElRef.current = el
    const rect = el.getBoundingClientRect()
    rendererRef.current = createSphereRenderer({
      container: el,
      width: rect.width,
      height: rect.height,
      cardCount: cards.length,
    })
  }, [cards.length])

  const placeCard = useCallback((placement: CardPlacement) => {
    rendererRef.current?.placeCard(placement)
  }, [])

  const removeCard = useCallback((id: string) => {
    rendererRef.current?.removeCard(id)
  }, [])

  const updateRadius = useCallback((cardCount: number) => {
    rendererRef.current?.updateRadius(cardCount)
  }, [])

  // リサイズ対応
  useEffect(() => {
    const handleResize = (): void => {
      const el = containerElRef.current
      if (!el || !rendererRef.current) return
      const rect = el.getBoundingClientRect()
      rendererRef.current.resize(rect.width, rect.height)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return {
    containerRef,
    cameraU,
    cameraV,
    zoom,
    visibleCards,
    placeCard,
    removeCard,
    updateRadius,
    isRotating,
  }
}
```

- [ ] **Step 2: コミット**

```bash
git add lib/sphere/use-sphere-canvas.ts
git commit -m "feat: add useSphereCanvas React hook"
```

---

## Task 8: SphereCanvasコンポーネント

**Files:**
- Create: `components/board/SphereCanvas.tsx`
- Create: `components/board/SphereCanvas.module.css`

- [ ] **Step 1: CSSモジュールを作成**

```css
/* components/board/SphereCanvas.module.css */
.sphereViewport {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  cursor: grab;
}

.sphereViewport:active {
  cursor: grabbing;
}

.cardWrapper {
  position: absolute;
  /* CSS3DRendererが配置を制御するのでここでは位置指定しない */
}

.cardReduced {
  filter: blur(2px);
  transition: filter 0.3s ease-out;
}
```

- [ ] **Step 2: SphereCanvasコンポーネントを実装**

```typescript
// components/board/SphereCanvas.tsx
'use client'

import { type ReactElement, useEffect, useMemo, useRef } from 'react'
import { useSphereCanvas, type SphereCanvasControls } from '@/lib/sphere/use-sphere-canvas'
import { worldToUv } from '@/lib/sphere/sphere-projection'
import { type CardRecord } from '@/lib/storage/indexeddb'
import type { SphereCard } from '@/lib/sphere/sphere-culling'
import styles from './SphereCanvas.module.css'

interface SphereCanvasProps {
  /** カード位置情報 (id, x, y, width, height) */
  cards: ReadonlyArray<CardRecord>
  /** 球面モード用のワールドスパン */
  worldSpan: number
  /** カードレンダリング関数 */
  renderCard: (cardId: string, lod: 'full' | 'reduced' | 'dot') => ReactElement | null
  /** 背景テーマ */
  bgTheme?: string
}

export function SphereCanvas({
  cards,
  worldSpan,
  renderCard,
  bgTheme,
}: SphereCanvasProps): ReactElement {
  // カード位置を球面座標に変換
  const sphereCards: SphereCard[] = useMemo(() =>
    cards.map(card => {
      const uv = worldToUv(card.x, card.y, worldSpan, worldSpan)
      return {
        id: card.id,
        u: uv.u,
        v: uv.v,
        width: card.width,
        height: card.height,
      }
    }),
    [cards, worldSpan],
  )

  const sphere = useSphereCanvas(sphereCards)

  return (
    <div
      ref={sphere.containerRef}
      className={styles.sphereViewport}
      data-bg-theme={bgTheme}
    >
      {sphere.visibleCards.map(vc => {
        if (vc.lod === 'dot') return null // WebGLドットで表示
        return (
          <div
            key={vc.id}
            className={`${styles.cardWrapper} ${vc.lod === 'reduced' ? styles.cardReduced : ''}`}
            style={{ opacity: vc.opacity }}
          >
            {renderCard(vc.id, vc.lod)}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: コミット**

```bash
git add components/board/SphereCanvas.tsx components/board/SphereCanvas.module.css
git commit -m "feat: add SphereCanvas component"
```

---

## Task 9: ViewModeToggle + board-client統合

**Files:**
- Create: `components/board/ViewModeToggle.tsx`
- Create: `components/board/ViewModeToggle.module.css`
- Modify: `app/(app)/board/board-client.tsx`
- Modify: `lib/storage/indexeddb.ts` (UserPreferencesRecordにviewMode3d追加)

- [ ] **Step 1: ViewModeToggle CSSモジュールを作成**

```css
/* components/board/ViewModeToggle.module.css */
.toggleGroup {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.toggleButton {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toggleButton:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.06);
}

.toggleButtonActive {
  composes: toggleButton;
  color: rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.12);
}

[data-theme="light"] .toggleGroup {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
}

[data-theme="light"] .toggleButton {
  color: rgba(0, 0, 0, 0.4);
}

[data-theme="light"] .toggleButton:hover {
  color: rgba(0, 0, 0, 0.7);
  background: rgba(0, 0, 0, 0.06);
}

[data-theme="light"] .toggleButtonActive {
  color: rgba(0, 0, 0, 0.9);
  background: rgba(0, 0, 0, 0.1);
}
```

- [ ] **Step 2: ViewModeToggleコンポーネントを実装**

```typescript
// components/board/ViewModeToggle.tsx
'use client'

import { type ReactElement } from 'react'
import styles from './ViewModeToggle.module.css'

export type CanvasMode = 'flat' | 'sphere'

interface ViewModeToggleProps {
  mode: CanvasMode
  onChange: (mode: CanvasMode) => void
  /** WebGL非対応時にtrueにしてsphereボタンを非表示にする */
  webglSupported: boolean
}

export function ViewModeToggle({
  mode,
  onChange,
  webglSupported,
}: ViewModeToggleProps): ReactElement | null {
  if (!webglSupported) return null

  return (
    <div className={styles.toggleGroup} role="radiogroup" aria-label="Canvas mode">
      <button
        className={mode === 'flat' ? styles.toggleButtonActive : styles.toggleButton}
        onClick={() => onChange('flat')}
        aria-checked={mode === 'flat'}
        role="radio"
        title="2D平面モード"
      >
        📋
      </button>
      <button
        className={mode === 'sphere' ? styles.toggleButtonActive : styles.toggleButton}
        onClick={() => onChange('sphere')}
        aria-checked={mode === 'sphere'}
        role="radio"
        title="3D球面モード"
      >
        🌐
      </button>
    </div>
  )
}
```

- [ ] **Step 3: IndexedDB UserPreferencesRecordにcanvasMode追加**

`lib/storage/indexeddb.ts` を修正。`UserPreferencesRecord` にフィールドを追加:

```typescript
// lib/storage/indexeddb.ts の UserPreferencesRecord に追加:
interface UserPreferencesRecord {
  // ... 既存フィールド ...
  canvasMode?: 'flat' | 'sphere'  // デフォルト: 'sphere'
}

// DEFAULT_PREFERENCES に追加:
// canvasMode: 'sphere'
```

- [ ] **Step 4: board-client.tsxにモード切替を統合**

`app/(app)/board/board-client.tsx` に以下の変更を追加:

1. `canvasMode` stateを追加:
```typescript
const [canvasMode, setCanvasMode] = useState<CanvasMode>('sphere')
const [webglSupported, setWebglSupported] = useState(true)
```

2. WebGLサポート検出を追加（useEffect内）:
```typescript
// WebGL detection
const canvas = document.createElement('canvas')
const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
if (!gl) {
  setWebglSupported(false)
  setCanvasMode('flat')
}
```

3. プリファレンスからcanvasModeを読み込み・保存

4. JSXでCanvasとSphereCanvasの条件分岐:
```typescript
{canvasMode === 'sphere' && webglSupported ? (
  <SphereCanvas
    cards={items.map(i => i.card)}
    worldSpan={calculateSphereRadius(items.length) * 2}
    renderCard={(cardId, lod) => {
      const item = items.find(i => i.card.id === cardId)
      if (!item) return null
      return <CardPortalContent /* ...existing props... */ />
    }}
    bgTheme={bgTheme}
  />
) : (
  <Canvas canvas={canvas} worldRef={worldRef} bgTheme={bgTheme}>
    {/* ...existing card rendering... */}
  </Canvas>
)}
```

5. ツールバーにViewModeToggleを配置

- [ ] **Step 5: コミット**

```bash
git add components/board/ViewModeToggle.tsx components/board/ViewModeToggle.module.css lib/storage/indexeddb.ts app/\(app\)/board/board-client.tsx
git commit -m "feat: add view mode toggle (sphere/flat) + board-client integration"
```

---

## Task 10: 空きスペースドラッグでパン（2D平面モード改善）

**Files:**
- Modify: `components/board/Canvas.tsx`
- Modify: `components/board/Canvas.module.css`

- [ ] **Step 1: Canvas.tsxのイベントハンドラーを修正**

`components/board/Canvas.tsx` を修正して、空きスペースの左クリックドラッグでパンできるようにする:

1. `handlePointerDown` で、ターゲットがビューポートまたはワールドdiv自体（カードでない空きスペース）の場合にパンモードに入る:

```typescript
// 既存のSpace+左クリック・ミドルクリックに加えて:
// 空きスペース（カードでないところ）の左クリックドラッグでもパン
const isEmptySpace = e.target === viewportRef.current || e.target === worldRef?.current
if (e.button === 0 && isEmptySpace) {
  // パン開始
  canvas.setIsPanning(true)
  panStartRef.current = { x: e.clientX, y: e.clientY }
  viewportRef.current?.setPointerCapture(e.pointerId)
}
```

2. カーソルを `cursor: grab` / `cursor: grabbing` に変更（空きスペース時）

- [ ] **Step 2: Canvas.module.cssにgrabカーソルを追加**

```css
/* 既存のviewportスタイルに追加 */
.viewport {
  cursor: grab;
}

.viewport[data-panning="true"] {
  cursor: grabbing;
}

/* カードの上ではデフォルトカーソルに戻す */
```

- [ ] **Step 3: 動作確認**

```bash
rtk pnpm run dev
```

ブラウザで確認:
- 空きスペースをドラッグ → パン動作
- Space + ドラッグ → パン動作（カード上でも）
- ミドルクリック → パン動作（カード上でも）
- カードをドラッグ → カード移動（従来通り）

- [ ] **Step 4: コミット**

```bash
git add components/board/Canvas.tsx components/board/Canvas.module.css
git commit -m "feat: drag on empty space to pan canvas"
```

---

## Task 11: 統合テスト + ビルド確認

**Files:**
- Create: `lib/sphere/__tests__/integration.test.ts`

- [ ] **Step 1: 統合テストを作成**

```typescript
// lib/sphere/__tests__/integration.test.ts
import { describe, it, expect } from 'vitest'
import {
  uvToSphere,
  sphereToUv,
  worldToUv,
  calculateSphereRadius,
} from '../sphere-projection'
import { getVisibleCards, type SphereCard } from '../sphere-culling'
import { applyRotation, wrapUv } from '../sphere-interaction'

describe('sphere integration', () => {
  it('full pipeline: world coords → UV → sphere → culling', () => {
    // 10枚のカードをワールド座標に配置
    const worldCards = Array.from({ length: 10 }, (_, i) => ({
      id: `card-${i}`,
      x: (i % 5) * 300 - 600,
      y: Math.floor(i / 5) * 300 - 150,
      width: 280,
      height: 200,
    }))

    const radius = calculateSphereRadius(10)
    const worldSpan = radius * 2

    // ワールド→UV変換
    const sphereCards: SphereCard[] = worldCards.map(c => {
      const uv = worldToUv(c.x, c.y, worldSpan, worldSpan)
      return { id: c.id, u: uv.u, v: uv.v, width: c.width, height: c.height }
    })

    // カメラを正面 (0.5, 0.5) に向けてカリング
    const visible = getVisibleCards(sphereCards, 0.5, 0.5, 1.0)
    expect(visible.length).toBeGreaterThan(0)
    expect(visible.every(v => v.lod !== undefined)).toBe(true)
  })

  it('rotation wraps around the sphere', () => {
    let pos = { u: 0.5, v: 0.5 }
    // 大量にドラッグして一周
    for (let i = 0; i < 100; i++) {
      pos = applyRotation(pos.u, pos.v, 50, 0, 800, 1.0)
    }
    // uは0〜1の範囲に収まる
    expect(pos.u).toBeGreaterThanOrEqual(0)
    expect(pos.u).toBeLessThanOrEqual(1)
  })

  it('sphere coords roundtrip preserves position', () => {
    const radius = 1000
    // ランダムなUV座標でラウンドトリップ
    for (let i = 0; i < 20; i++) {
      const u = Math.random()
      const v = 0.1 + Math.random() * 0.8  // 極を避ける
      const sphere = uvToSphere(u, v, radius)
      const back = sphereToUv(sphere.x, sphere.y, sphere.z, radius)
      expect(back.u).toBeCloseTo(u, 3)
      expect(back.v).toBeCloseTo(v, 3)
    }
  })
})
```

- [ ] **Step 2: 全テストを実行**

```bash
rtk vitest run
```

Expected: 全テスト通過（既存108件 + 新規テスト）

- [ ] **Step 3: TypeScript型チェック**

```bash
rtk pnpm exec tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 4: ビルド確認**

```bash
rtk pnpm run build
```

Expected: ビルド成功

- [ ] **Step 5: コミット**

```bash
git add lib/sphere/__tests__/integration.test.ts
git commit -m "test: add sphere integration tests"
```

---

## Task 12: ブラウザ動作確認 + 微調整

- [ ] **Step 1: 開発サーバーを起動**

```bash
rtk pnpm run dev
```

- [ ] **Step 2: 球面モードの動作確認**

ブラウザで以下を確認:
1. 🌐ボタンで球面モードに切替 → 球面が表示される
2. 空きスペースドラッグ → 球面が回転する
3. ホイール → ズームイン/アウト
4. 最大ズームアウト → 球体全体が見える
5. パンし続ける → 一周して元に戻る
6. カードのクリック → 3Dフリップ + URL遷移
7. 📋ボタンで2D平面モードに戻る → 今まで通り動作

- [ ] **Step 3: パフォーマンス確認**

Chrome DevTools → Performance → 60fps以上を確認
（240FPSはモニター制限があるため、まずは安定60fps + CPU余裕を確認）

- [ ] **Step 4: 視覚微調整**

実際の見た目を見て以下を調整:
- ガラスシェーダーの `uDistortionStrength`（歪みの大きさ）
- ガラスシェーダーの `uIor`（屈折率）
- ブルームの `strength`
- ビネットの `uIntensity`
- 球体グローの `opacity`
- LOD切替の角度閾値

- [ ] **Step 5: 最終コミット**

```bash
git add -A
git commit -m "feat: 3D sphere navigation complete — WebGL + CSS3D hybrid"
```
