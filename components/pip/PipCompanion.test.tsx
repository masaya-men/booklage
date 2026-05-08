import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PipCompanion } from './PipCompanion'

vi.mock('@/lib/storage/indexeddb', () => ({
  initDB: vi.fn().mockResolvedValue({}),
  getRecentBookmarks: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/board/channel', () => ({
  subscribeBookmarkSaved: vi.fn(() => () => {}),
}))

describe('PipCompanion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when no bookmarks exist', async () => {
    const { getRecentBookmarks } = await import('@/lib/storage/indexeddb')
    ;(getRecentBookmarks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    render(<PipCompanion onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByTestId('pip-empty-state')).toBeTruthy()
    })
  })

  it('renders stack when bookmarks exist', async () => {
    const { getRecentBookmarks } = await import('@/lib/storage/indexeddb')
    ;(getRecentBookmarks as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'b1', title: 'Card 1', thumbnail: '', favicon: '', savedAt: '2026-05-09T10:00:00Z', url: '' },
      { id: 'b2', title: 'Card 2', thumbnail: '', favicon: '', savedAt: '2026-05-09T11:00:00Z', url: '' },
    ])
    render(<PipCompanion onClose={() => {}} />)
    await waitFor(() => {
      expect(screen.getByTestId('pip-stack')).toBeTruthy()
    })
  })

  it('calls onClose when × is clicked', async () => {
    const onClose = vi.fn()
    render(<PipCompanion onClose={onClose} />)
    // Wait for the loaded render to settle (avoid clicking the loading-state
    // button which gets unmounted by the loaded-state re-render).
    await waitFor(() => {
      expect(screen.getByTestId('pip-empty-state')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('pip-close'))
    expect(onClose).toHaveBeenCalled()
  })
})
