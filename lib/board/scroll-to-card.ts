export interface FocusScrollInput {
  readonly cardY: number
  readonly cardH: number
  readonly viewportH: number
  readonly contentH?: number
}

export function computeFocusScrollY(input: FocusScrollInput): number {
  const { cardY, cardH, viewportH, contentH } = input
  const desired = cardY + cardH / 2 - viewportH / 2
  const clampedLow = Math.max(0, desired)
  if (typeof contentH === 'number') {
    return Math.min(clampedLow, Math.max(0, contentH - viewportH))
  }
  return clampedLow
}
