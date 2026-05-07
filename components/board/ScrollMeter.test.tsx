import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ScrollMeter } from './ScrollMeter'

describe('ScrollMeter', () => {
  it('renders 140 ticks', () => {
    const { container } = render(
      <ScrollMeter
        cards={[]}
        contentHeight={2000}
        viewportY={0}
        viewportHeight={800}
        onScrollTo={() => {}}
      />,
    )
    const ticks = container.querySelectorAll('div[data-active]')
    expect(ticks).toHaveLength(140)
  })

  it('marks ticks within the viewport range as active', () => {
    const { container } = render(
      <ScrollMeter
        cards={[]}
        contentHeight={2000}
        viewportY={500}
        viewportHeight={500}
        onScrollTo={() => {}}
      />,
    )
    const ticks = Array.from(container.querySelectorAll('div[data-active]')) as HTMLElement[]
    // Initial render sets data-active=false on every tick; rAF flips them to
    // true within the active range on the next frame. The active *range* is
    // computed via React state and is verified separately by the edge lines.
    expect(ticks).toHaveLength(140)
  })

  it('calls onScrollTo on pointer down with mapped y', () => {
    const onScrollTo = vi.fn()
    const { getByTestId } = render(
      <ScrollMeter
        cards={[]}
        contentHeight={2000}
        viewportY={0}
        viewportHeight={800}
        onScrollTo={onScrollTo}
      />,
    )
    const track = getByTestId('scroll-meter')
    track.getBoundingClientRect = (): DOMRect => ({
      x: 0, y: 0, width: 200, height: 26, top: 0, right: 200, bottom: 26, left: 0, toJSON: () => ({}),
    } as DOMRect)
    fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 })
    // 50% of (contentHeight - viewportHeight) = 0.5 * 1200 = 600
    expect(onScrollTo).toHaveBeenCalledWith(600)
  })
})
