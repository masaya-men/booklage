import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ScrollMeter } from './ScrollMeter'

describe('ScrollMeter', () => {
  it('renders 140 ticks plus baseline', () => {
    const { container } = render(
      <ScrollMeter
        contentHeight={2000}
        viewportY={0}
        viewportHeight={800}
        onScrollTo={() => {}}
      />,
    )
    // Each tick has class containing "tick" (CSS module mangles it). Easiest
    // selector is divs with an inline `left` style — the baseline div has
    // no inline style, the hover line is conditional.
    const ticks = Array.from(
      (container.firstChild as HTMLElement).children,
    ).filter((el) => (el as HTMLElement).style.left)
    expect(ticks).toHaveLength(140)
  })

  it('calls onScrollTo on pointer down with mapped y', () => {
    const onScrollTo = vi.fn()
    const { getByTestId } = render(
      <ScrollMeter
        contentHeight={2000}
        viewportY={0}
        viewportHeight={800}
        onScrollTo={onScrollTo}
      />,
    )
    const track = getByTestId('scroll-meter')
    track.getBoundingClientRect = (): DOMRect => ({
      x: 0, y: 0, width: 200, height: 28, top: 0, right: 200, bottom: 28, left: 0, toJSON: () => ({}),
    } as DOMRect)
    fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 })
    // 50% of (contentHeight - viewportHeight) = 0.5 * 1200 = 600
    expect(onScrollTo).toHaveBeenCalledWith(600)
  })
})
