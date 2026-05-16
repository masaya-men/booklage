import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ScrollMeter } from './ScrollMeter'

describe('ScrollMeter', () => {
  it('renders 150 ticks inside the track', () => {
    const { getByTestId } = render(
      <ScrollMeter
        contentHeight={2000}
        viewportY={0}
        viewportHeight={800}
        onScrollTo={() => {}}
        visibleRangeStart={1}
        visibleRangeEnd={12}
        totalCount={234}
      />,
    )
    const track = getByTestId('scroll-meter')
    const tickElements = Array.from(track.children).filter(
      (el) => (el as HTMLElement).style.left,
    )
    expect(tickElements).toHaveLength(150)
  })

  it('calls onScrollTo on pointer down with mapped y', () => {
    const onScrollTo = vi.fn()
    const { getByTestId } = render(
      <ScrollMeter
        contentHeight={2000}
        viewportY={0}
        viewportHeight={800}
        onScrollTo={onScrollTo}
        visibleRangeStart={1}
        visibleRangeEnd={12}
        totalCount={234}
      />,
    )
    const track = getByTestId('scroll-meter')
    track.getBoundingClientRect = (): DOMRect => ({
      x: 0, y: 0, width: 200, height: 18, top: 0, right: 200, bottom: 18, left: 0, toJSON: () => ({}),
    } as DOMRect)
    fireEvent.pointerDown(track, { clientX: 100, pointerId: 1 })
    // 50% of (contentHeight - viewportHeight) = 0.5 * 1200 = 600
    expect(onScrollTo).toHaveBeenCalledWith(600)
  })

  it('renders the counter readout with zero-padded N1, N2, TOTAL', () => {
    const { container } = render(
      <ScrollMeter
        contentHeight={2000}
        viewportY={0}
        viewportHeight={800}
        onScrollTo={() => {}}
        visibleRangeStart={1}
        visibleRangeEnd={12}
        totalCount={234}
      />,
    )
    // The counter row pre-renders the initial values before the rAF loop
    // overwrites them on first frame; in jsdom rAF doesn't fire so the
    // initial textContent is what we assert against.
    expect(container.textContent).toContain('0001')
    expect(container.textContent).toContain('0012')
    expect(container.textContent).toContain('0234')
  })
})
