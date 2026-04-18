/**
 * 球面インタラクション — 回転・慣性・ズーム
 *
 * カメラの向きをUV座標 (u, v) で管理。
 * u: 経度方向 (0〜1、一周して戻る)
 * v: 緯度方向 (0.05〜0.95、極は制限)
 */

export interface DragSample {
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
  const circumference = 2 * Math.PI * sphereRadius
  const sensitivity = 1.0 / zoom
  const du = -(deltaX / circumference) * sensitivity
  const dv = -(deltaY / (circumference / 2)) * sensitivity
  return wrapUv(currentU + du, currentV + dv)
}

/** UV座標をラップ（一周処理 + 極制限） */
export function wrapUv(u: number, v?: number): { u: number; v: number } {
  let wrappedU = u % 1
  if (wrappedU < 0) wrappedU += 1

  const V_MIN = 0.05
  const V_MAX = 0.95
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

  const last = history[history.length - 1]!
  const prev = history[history.length - 2]!
  const dt = last.time - prev.time
  if (dt <= 0) return { du: 0, dv: 0 }

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
 */
const ZOOM_MIN = 0.1
const ZOOM_MAX = 3.0

export function calculateZoomCurvature(zoom: number): number {
  const t = (zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)
  const clamped = Math.max(0, Math.min(1, t))
  return 1 - clamped * clamped
}
