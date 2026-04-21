import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { BookmarkletInstallModal } from './BookmarkletInstallModal'

afterEach(cleanup)

describe('BookmarkletInstallModal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<BookmarkletInstallModal isOpen={false} onClose={() => {}} appUrl="https://booklage.pages.dev" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders dialog when isOpen is true', () => {
    render(<BookmarkletInstallModal isOpen={true} onClose={() => {}} appUrl="https://booklage.pages.dev" />)
    expect(screen.getByRole('dialog')).not.toBeNull()
  })

  it('renders draggable link with javascript: URI', () => {
    render(<BookmarkletInstallModal isOpen={true} onClose={() => {}} appUrl="https://booklage.pages.dev" />)
    const link = screen.getByTestId('bookmarklet-drag-link')
    expect(link.getAttribute('href')?.startsWith('javascript:')).toBe(true)
    expect(link.getAttribute('draggable')).toBe('true')
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<BookmarkletInstallModal isOpen={true} onClose={onClose} appUrl="https://booklage.pages.dev" />)
    fireEvent.click(screen.getByRole('button', { name: /閉じる/ }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when ESC key is pressed', () => {
    const onClose = vi.fn()
    render(<BookmarkletInstallModal isOpen={true} onClose={onClose} appUrl="https://booklage.pages.dev" />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('prevents default on link click (drag-only semantics)', () => {
    render(<BookmarkletInstallModal isOpen={true} onClose={() => {}} appUrl="https://booklage.pages.dev" />)
    const link = screen.getByTestId('bookmarklet-drag-link')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
