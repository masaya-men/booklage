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

  it('calls onClick when Enter is pressed', () => {
    const onClick = vi.fn()
    render(<BookmarkletInstall onClick={onClick} />)
    const btn = screen.getByRole('button')
    fireEvent.keyDown(btn, { key: 'Enter' })
    expect(onClick).toHaveBeenCalledOnce()
  })
})
