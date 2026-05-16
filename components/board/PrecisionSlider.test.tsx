import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PrecisionSlider } from './PrecisionSlider'

describe('PrecisionSlider', () => {
  it('renders the label and 4-digit zero-padded value', () => {
    const { container, getByTestId } = render(
      <PrecisionSlider
        label="W"
        min={120}
        max={720}
        value={280}
        onChange={() => {}}
        testId="t-slider"
      />,
    )
    expect(container.textContent).toContain('W')
    expect(container.textContent).toContain('0280')
    expect(getByTestId('t-slider')).toBeDefined()
  })

  it('rounds floats for display and zero-pads small values', () => {
    const { container } = render(
      <PrecisionSlider
        label="G"
        min={0}
        max={300}
        value={18.4}
        onChange={() => {}}
        testId="t-slider"
      />,
    )
    // 18.4 → rounded → '0018'
    expect(container.textContent).toContain('0018')
  })

  it('moves the value by movementX × ratio during drag', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(
      <PrecisionSlider
        label="W"
        min={120}
        max={720}
        value={280}
        onChange={onChange}
        testId="t-slider"
      />,
    )
    const track = getByTestId('t-slider')
    fireEvent.pointerDown(track, { pointerId: 1, clientX: 50 })
    // ratio = (720 - 120) / 1000 = 0.6
    // movementX 100 → +60 → next = 340
    fireEvent.pointerMove(track, { pointerId: 1, movementX: 100 })
    expect(onChange).toHaveBeenLastCalledWith(340)
    fireEvent.pointerUp(track, { pointerId: 1 })
  })

  it('clamps the value at max when overshooting', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(
      <PrecisionSlider
        label="W"
        min={120}
        max={720}
        value={700}
        onChange={onChange}
        testId="t-slider"
      />,
    )
    const track = getByTestId('t-slider')
    fireEvent.pointerDown(track, { pointerId: 1 })
    // ratio = 0.6, movementX = 1000 → +600 → 1300 → clamp to 720
    fireEvent.pointerMove(track, { pointerId: 1, movementX: 1000 })
    expect(onChange).toHaveBeenLastCalledWith(720)
  })

  it('clamps the value at min when undershooting', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(
      <PrecisionSlider
        label="W"
        min={120}
        max={720}
        value={150}
        onChange={onChange}
        testId="t-slider"
      />,
    )
    const track = getByTestId('t-slider')
    fireEvent.pointerDown(track, { pointerId: 1 })
    fireEvent.pointerMove(track, { pointerId: 1, movementX: -1000 })
    expect(onChange).toHaveBeenLastCalledWith(120)
  })

  it('does NOT change value on pointermove without prior pointerdown', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(
      <PrecisionSlider
        label="W"
        min={120}
        max={720}
        value={280}
        onChange={onChange}
        testId="t-slider"
      />,
    )
    const track = getByTestId('t-slider')
    fireEvent.pointerMove(track, { pointerId: 1, movementX: 100 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('supports arrow-key adjustment (+1 / -1)', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(
      <PrecisionSlider
        label="W"
        min={120}
        max={720}
        value={280}
        onChange={onChange}
        testId="t-slider"
      />,
    )
    const track = getByTestId('t-slider')
    fireEvent.keyDown(track, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(281)
    fireEvent.keyDown(track, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(279)
    fireEvent.keyDown(track, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith(281)
    fireEvent.keyDown(track, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith(279)
  })

  it('supports Home / End to jump to min / max', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(
      <PrecisionSlider
        label="W"
        min={120}
        max={720}
        value={280}
        onChange={onChange}
        testId="t-slider"
      />,
    )
    const track = getByTestId('t-slider')
    fireEvent.keyDown(track, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(120)
    fireEvent.keyDown(track, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith(720)
  })

  it('does not crash when value is NaN', () => {
    const { container } = render(
      <PrecisionSlider
        label="W"
        min={120}
        max={720}
        value={Number.NaN}
        onChange={() => {}}
        testId="t-slider"
      />,
    )
    // falls back to min (= 120) for display
    expect(container.textContent).toContain('0120')
  })

  it('sets aria attributes on the track', () => {
    const { getByTestId } = render(
      <PrecisionSlider
        label="G"
        ariaLabel="Card gap"
        min={0}
        max={300}
        value={18}
        onChange={() => {}}
        testId="t-slider"
      />,
    )
    const track = getByTestId('t-slider')
    expect(track.getAttribute('role')).toBe('slider')
    expect(track.getAttribute('aria-valuemin')).toBe('0')
    expect(track.getAttribute('aria-valuemax')).toBe('300')
    expect(track.getAttribute('aria-valuenow')).toBe('18')
    expect(track.getAttribute('aria-label')).toBe('Card gap')
  })
})
