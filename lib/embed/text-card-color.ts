/**
 * TextCard color variant picker.
 * Deterministic per-card: same cardId always resolves to the same variant
 * so a board's layout doesn't reshuffle visually between sessions.
 */

export type TextCardColor = 'white' | 'black'

/**
 * Pick a TextCard color variant from the cardId.
 * Uses a djb2-style hash for stable, well-distributed bit-1 parity.
 * Falls back to 'white' if cardId is empty (defensive — shouldn't happen
 * in practice since cardId is a required field).
 */
export function pickTextCardColor(cardId: string): TextCardColor {
  if (!cardId) return 'white'
  let hash = 5381
  for (let i = 0; i < cardId.length; i++) {
    hash = ((hash << 5) + hash) ^ cardId.charCodeAt(i)
    hash |= 0
  }
  return (hash & 1) === 0 ? 'white' : 'black'
}
