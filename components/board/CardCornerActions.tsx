'use client'

import {
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from 'react'
import styles from './CardCornerActions.module.css'

type Props = {
  /** True when the parent card is hovered. Controls the entrance fade
   *  on the icons; the buttons keep `pointer-events: auto` so a moving
   *  cursor never loses contact mid-click. */
  readonly hovered: boolean
  /** True when the user has manually resized this card via the corner
   *  ResizeHandle. Reset (↺) is shown only in that state — it's the
   *  only case where it would do anything useful. */
  readonly hasCustomWidth: boolean
  /** Soft-delete handler. Replaces the right-click delete fallback for
   *  pointer users; right-click still works as a redundant shortcut on
   *  the card itself, but this button is the discoverable path. */
  readonly onDelete: () => void
  /** Reset-size handler. Drops `customCardWidth` for this card so the
   *  header SizePicker takes over again. */
  readonly onResetSize: () => void
}

/**
 * Hover-revealed top-right delete (×) and bottom-left reset (↺)
 * affordances. Sits ABOVE the four resize-handle hot zones so a click
 * on the icon never engages a resize drag, but only consumes pointer
 * events on the icon itself — the surrounding 32×32 hit zone is
 * transparent to outside taps so resize drags still work elsewhere
 * along the corner.
 */
export function CardCornerActions({
  hovered,
  hasCustomWidth,
  onDelete,
  onResetSize,
}: Props): ReactElement {
  // pointerdown / mousedown both stop propagation so the card-parent's
  // reorder pointerdown handler (in CardsLayer) doesn't engage. Calling
  // preventDefault on pointerdown also keeps the corner ResizeHandle's
  // synthetic listeners — registered on a sibling div — from receiving
  // the event via bubbling.
  const swallow = (
    e: ReactPointerEvent<HTMLButtonElement> | ReactMouseEvent<HTMLButtonElement>,
  ): void => {
    e.stopPropagation()
  }

  return (
    <>
      <button
        type="button"
        className={styles.delete}
        data-visible={hovered}
        data-testid="card-delete-button"
        aria-label="Delete bookmark"
        onPointerDown={swallow}
        onMouseDown={swallow}
        onClick={(e): void => {
          e.stopPropagation()
          onDelete()
        }}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path
            d="M3 3 L9 9 M9 3 L3 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {hasCustomWidth && (
        <button
          type="button"
          className={styles.reset}
          data-visible={hovered}
          data-testid="card-reset-size-button"
          aria-label="Reset card size"
          onPointerDown={swallow}
          onMouseDown={swallow}
          onClick={(e): void => {
            e.stopPropagation()
            onResetSize()
          }}
        >
          <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
            <path
              d="M2.5 7a4.5 4.5 0 1 0 1.4-3.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M2.5 3v2.5h2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </>
  )
}
