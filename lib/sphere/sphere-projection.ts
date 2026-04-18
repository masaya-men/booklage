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
 *   z = r * sin(phi) * cos(theta)
 *
 * u=0.5, v=0.5 を「正面」(z = -r) にマップするため、
 * theta=π で z=-r になるよう cos(theta) に負号をかけない。
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
    z: radius * sinPhi * Math.cos(theta),
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
    theta = Math.atan2(x / (radius * sinPhi), z / (radius * sinPhi))
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
const AVG_CARD_AREA = 280 * 200
const SPACING_FACTOR = 4

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

  const dot =
    Math.sin(phi1) * Math.sin(phi2) * Math.cos(theta1 - theta2) +
    Math.cos(phi1) * Math.cos(phi2)

  return Math.acos(Math.max(-1, Math.min(1, dot)))
}
