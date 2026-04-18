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
 * | 段階      | 角距離 (rad)   | 角度      | 表示方法            |
 * |-----------|---------------|-----------|---------------------|
 * | full      | 0 〜 π/4      | 0°〜45°   | フルDOM             |
 * | reduced   | π/4 〜 5π/12  | 45°〜75°  | DOM + ブラー        |
 * | dot       | 5π/12 〜 2π/3 | 75°〜120° | WebGLドット         |
 * | hidden    | 2π/3 〜 π     | 120°〜180°| 非表示              |
 */
const THRESHOLD_FULL = Math.PI / 4
const THRESHOLD_REDUCED = (5 * Math.PI) / 12
const THRESHOLD_DOT = (2 * Math.PI) / 3

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

    let opacity: number
    if (lod === 'full') {
      opacity = 1.0
    } else if (lod === 'reduced') {
      const t = (dist - adjustedFull) / (adjustedReduced - adjustedFull)
      opacity = 1.0 - t * 0.5
    } else {
      const t = (dist - adjustedReduced) / (adjustedDot - adjustedReduced)
      opacity = 0.5 - t * 0.4
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
