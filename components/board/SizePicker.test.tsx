import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SizePicker } from './SizePicker'

describe('SizePicker', () => {
  it('renders 5 numbered cells', () => {
    const { getAllByRole } = render(<SizePicker value={3} onChange={() => {}} />)
    const cells = getAllByRole('radio')
    expect(cells).toHaveLength(5)
    expect(cells.map((c) => c.textContent?.trim())).toEqual(['1', '2', '3', '4', '5'])
  })

  it('marks the current value as checked', () => {
    const { getByLabelText } = render(<SizePicker value={4} onChange={() => {}} />)
    const cell = getByLabelText('Size 4')
    expect(cell.getAttribute('aria-checked')).toBe('true')
    expect(cell.getAttribute('data-active')).toBe('true')
  })

  it('calls onChange with the clicked level', () => {
    const onChange = vi.fn()
    const { getByLabelText } = render(<SizePicker value={3} onChange={onChange} />)
    fireEvent.click(getByLabelText('Size 5'))
    expect(onChange).toHaveBeenCalledWith(5)
  })
})
