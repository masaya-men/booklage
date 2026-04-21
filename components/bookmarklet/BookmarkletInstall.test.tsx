import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { BookmarkletInstall } from './BookmarkletInstall'

afterEach(cleanup)

describe('BookmarkletInstall', () => {
  it('renders the label from i18n', () => {
    render(<BookmarkletInstall onClick={() => {}} />)
    expect(screen.getByText('ブックマークレット')).not.toBeNull()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<BookmarkletInstall onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders a button element (native keyboard activation inherited)', () => {
    render(<BookmarkletInstall onClick={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.getAttribute('type')).toBe('button')
  })
})
