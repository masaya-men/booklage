import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SizeSlider } from './SizeSlider'

describe('SizeSlider', () => {
  it('renders the current value as a 4-digit padded readout', () => {
    const { getByTestId } = render(
      <SizeSlider value={240} onChange={() => {}} />,
    )
    expect(getByTestId('size-slider-readout').textContent).toContain('0240')
  })

  it('calls onChange with clamped value when the input changes', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<SizeSlider value={240} onChange={onChange} />)
    const range = getByRole('slider')
    fireEvent.change(range, { target: { value: '999' } })
    // 999 clamps to MAX = 480
    expect(onChange).toHaveBeenCalledWith(480)
  })
})
