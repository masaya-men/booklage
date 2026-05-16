import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EmptyStateWelcome } from './EmptyStateWelcome'

afterEach(cleanup)

describe('EmptyStateWelcome', () => {
  it('renders the title from i18n', () => {
    render(<EmptyStateWelcome onOpenModal={() => {}} />)
    expect(screen.getByText('ブックマークをはじめよう')).not.toBeNull()
  })

  it('renders description and already-installed hint', () => {
    render(<EmptyStateWelcome onOpenModal={() => {}} />)
    expect(screen.getByText(/1 クリックで保存できる/)).not.toBeNull()
    expect(screen.getByText(/既に設置済/)).not.toBeNull()
  })

  it('calls onOpenModal when install button is clicked', () => {
    const onOpenModal = vi.fn()
    render(<EmptyStateWelcome onOpenModal={onOpenModal} />)
    fireEvent.click(screen.getByRole('button', { name: /AllMarks を設置/ }))
    expect(onOpenModal).toHaveBeenCalledOnce()
  })
})
