import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PopOutButton } from './PopOutButton'

describe('PopOutButton', () => {
  it('renders with title attribute "Open AllMarks Companion"', () => {
    render(<PopOutButton onClick={() => {}} disabled={false} />)
    const btn = screen.getByTestId('pip-popout')
    expect(btn.getAttribute('title')).toBe('Open AllMarks Companion')
  })

  it('calls onClick when enabled and clicked', () => {
    const onClick = vi.fn()
    render(<PopOutButton onClick={onClick} disabled={false} />)
    fireEvent.click(screen.getByTestId('pip-popout'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disables button when disabled prop is true', () => {
    render(<PopOutButton onClick={() => {}} disabled={true} />)
    const btn = screen.getByTestId('pip-popout') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
