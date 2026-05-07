import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ResetAllButton } from './ResetAllButton'

describe('ResetAllButton', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<ResetAllButton count={0} onClick={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the count badge when count > 0', () => {
    const { getByTestId } = render(<ResetAllButton count={5} onClick={() => {}} />)
    const btn = getByTestId('reset-all-button')
    expect(btn.textContent).toContain('5')
  })

  it('fires onClick when pressed', () => {
    const onClick = vi.fn()
    const { getByTestId } = render(<ResetAllButton count={2} onClick={onClick} />)
    fireEvent.click(getByTestId('reset-all-button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('exposes a meaningful aria-label including the count', () => {
    const { getByTestId } = render(<ResetAllButton count={3} onClick={() => {}} />)
    const label = getByTestId('reset-all-button').getAttribute('aria-label')
    expect(label).toContain('3')
  })
})
