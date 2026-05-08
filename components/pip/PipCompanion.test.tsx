import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { PipCompanion } from './PipCompanion'

let savedHandler: ((msg: { bookmarkId: string }) => void) | null = null

vi.mock('@/lib/storage/indexeddb', () => ({
  initDB: vi.fn().mockResolvedValue({
    get: vi.fn().mockImplementation((_store: string, id: string) =>
      Promise.resolve({ id, title: `Title ${id}`, thumbnail: '', favicon: '', url: '' }),
    ),
  }),
}))

vi.mock('@/lib/board/channel', () => ({
  subscribeBookmarkSaved: vi.fn((handler: (msg: { bookmarkId: string }) => void) => {
    savedHandler = handler
    return () => { savedHandler = null }
  }),
}))

describe('PipCompanion', () => {
  beforeEach(() => {
    savedHandler = null
    vi.clearAllMocks()
  })

  it('renders empty state on mount (no initial IDB read of past bookmarks)', () => {
    render(<PipCompanion onClose={() => {}} />)
    expect(screen.getByTestId('pip-empty-state')).toBeTruthy()
  })

  it('switches to stack when a new bookmark-saved event arrives', async () => {
    render(<PipCompanion onClose={() => {}} />)
    expect(screen.getByTestId('pip-empty-state')).toBeTruthy()

    // Simulate the BroadcastChannel callback firing.
    expect(savedHandler).toBeTruthy()
    await act(async () => {
      await savedHandler?.({ bookmarkId: 'b1' })
    })

    await waitFor(() => {
      expect(screen.getByTestId('pip-stack')).toBeTruthy()
    })
  })

})
