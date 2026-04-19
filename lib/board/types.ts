export type ScrollDirection = 'vertical' | 'horizontal' | '2d' | 'sphere'

export type ThemeId = 'dotted-notebook' | 'grid-paper'

export type CardPosition = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export type LayoutCard = {
  readonly id: string
  readonly aspectRatio: number
  readonly userOverridePos?: CardPosition
}

export type LayoutInput = {
  readonly cards: ReadonlyArray<LayoutCard>
  readonly viewportWidth: number
  readonly targetRowHeight: number
  readonly gap: number
  readonly direction: ScrollDirection
}

export type LayoutResult = {
  readonly positions: Readonly<Record<string, CardPosition>>
  readonly totalHeight: number
  readonly totalWidth: number
}

export type InteractionState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'scrolling' }
  | {
      readonly kind: 'card-dragging'
      readonly cardId: string
      readonly startX: number
      readonly startY: number
    }
  | {
      readonly kind: 'card-resizing'
      readonly cardId: string
      readonly startW: number
      readonly startH: number
    }

export type ThemeLayoutParams = {
  readonly targetRowHeight?: number
  readonly gap?: number
}

export type ThemeMeta = {
  readonly id: ThemeId
  readonly direction: ScrollDirection
  readonly backgroundClassName: string
  readonly labelKey: string
  readonly layoutParams?: ThemeLayoutParams
}
