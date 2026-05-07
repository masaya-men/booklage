import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ResizeHandle } from './ResizeHandle'

function renderInCard(
  props: Parameters<typeof ResizeHandle>[0],
  cardWidth = 240,
  cardHeight = 300,
) {
  // ResizeHandle reads its anchor from offsetParent.getBoundingClientRect().
  // jsdom's default rect is {0,0,0,0}, which is fine for testing — we
  // only verify the callback contract, not the geometry math.
  return render(
    <div
      style={{
        position: 'relative',
        width: `${cardWidth}px`,
        height: `${cardHeight}px`,
      }}
    >
      <ResizeHandle {...props} />
    </div>,
  )
}

describe('ResizeHandle', () => {
  it('renders all four corner hot zones with cursor classes', () => {
    const { getByTestId } = renderInCard({
      cardWidth: 240,
      cardHeight: 300,
      maxCardWidth: 1200,
      onResize: () => {},
    })
    expect(getByTestId('resize-handle-tl')).toBeTruthy()
    expect(getByTestId('resize-handle-tr')).toBeTruthy()
    expect(getByTestId('resize-handle-bl')).toBeTruthy()
    expect(getByTestId('resize-handle-br')).toBeTruthy()
  })

  it('stops pointerdown propagation so the parent reorder drag does not engage', () => {
    const parentDown = vi.fn()
    const { getByTestId } = render(
      <div onPointerDown={parentDown}>
        <ResizeHandle cardWidth={240} cardHeight={300} maxCardWidth={1200} onResize={() => {}} />
      </div>,
    )
    const br = getByTestId('resize-handle-br')
    fireEvent.pointerDown(br, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    expect(parentDown).not.toHaveBeenCalled()
  })

  it('ignores secondary buttons (right-click etc.)', () => {
    const onResize = vi.fn()
    const { getByTestId } = renderInCard({
      cardWidth: 240,
      cardHeight: 300,
      maxCardWidth: 1200,
      onResize,
    })
    const br = getByTestId('resize-handle-br')
    fireEvent.pointerDown(br, { button: 2, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(br, { clientX: 200, clientY: 200 })
    expect(onResize).not.toHaveBeenCalled()
  })

  it('does not fire onResize for a sub-threshold pointermove', () => {
    const onResize = vi.fn()
    const onResizeEnd = vi.fn()
    const { getByTestId } = renderInCard({
      cardWidth: 240,
      cardHeight: 300,
      maxCardWidth: 1200,
      onResize,
      onResizeEnd,
    })
    const br = getByTestId('resize-handle-br')
    fireEvent.pointerDown(br, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    // Less than 2px drag → not registered as a real drag
    fireEvent.pointerMove(br, { clientX: 100.5, clientY: 100.5 })
    fireEvent.pointerUp(br, { clientX: 100.5, clientY: 100.5 })
    expect(onResize).not.toHaveBeenCalled()
    expect(onResizeEnd).not.toHaveBeenCalled()
  })

  it('reports a clamped width even on a huge drag', () => {
    const onResize = vi.fn()
    const { getByTestId } = renderInCard({
      cardWidth: 240,
      cardHeight: 300,
      maxCardWidth: 1200,
      onResize,
    })
    const br = getByTestId('resize-handle-br')
    fireEvent.pointerDown(br, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(br, { clientX: 5000, clientY: 5000 })
    expect(onResize).toHaveBeenCalled()
    const lastCall = onResize.mock.calls[onResize.mock.calls.length - 1]
    const reported = lastCall[0] as number
    // Clamped to maxCardWidth=1200 (passed in test setup) at the upper end
    // and MIN_CARD_WIDTH=80 at the lower end.
    expect(reported).toBeLessThanOrEqual(1200)
    expect(reported).toBeGreaterThanOrEqual(80)
  })
})
