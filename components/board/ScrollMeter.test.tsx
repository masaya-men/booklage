import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ScrollMeter } from './ScrollMeter'

describe('ScrollMeter', () => {
  it('renders 56 bars', () => {
    const { container } = render(
      <ScrollMeter
        cards={[]}
        contentHeight={2000}
        viewportY={0}
        viewportHeight={800}
        onScrollTo={() => {}}
      />,
    )
    const bars = container.querySelectorAll('span[data-active]')
    expect(bars).toHaveLength(56)
  })

  it('marks bars within the viewport range as active', () => {
    const { container } = render(
      <ScrollMeter
        cards={[]}
        contentHeight={2000}
        viewportY={500}
        viewportHeight={500}
        onScrollTo={() => {}}
      />,
    )
    const bars = Array.from(container.querySelectorAll('span[data-active]')) as HTMLElement[]
    // viewport 500-1000 of 2000 = 25%-50% range. Some bars in 25%..50% should be active.
    const activeCount = bars.filter((b) => b.dataset.active === 'true').length
    expect(activeCount).toBeGreaterThan(0)
    expect(activeCount).toBeLessThan(56)
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
    // Mock getBoundingClientRect so the click ratio is deterministic.
    track.getBoundingClientRect = (): DOMRect => ({
      x: 0, y: 0, width: 200, height: 26, top: 0, right: 200, bottom: 26, left: 0, toJSON: () => ({}),
    } as DOMRect)
    fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 })
    // 50% of (contentHeight - viewportHeight) = 0.5 * 1200 = 600
    expect(onScrollTo).toHaveBeenCalledWith(600)
  })
})
