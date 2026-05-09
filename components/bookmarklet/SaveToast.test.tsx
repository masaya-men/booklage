import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SaveToast } from './SaveToast'

let mockParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockParams,
}))

vi.mock('@/lib/storage/indexeddb', () => ({
  initDB: vi.fn().mockResolvedValue({}),
  addBookmark: vi.fn().mockResolvedValue({ id: 'bm-test-1' }),
}))

vi.mock('@/lib/board/channel', () => ({
  postBookmarkSaved: vi.fn(),
}))

let mockPipActive = false
vi.mock('@/lib/board/pip-presence', () => ({
  queryPipPresence: vi.fn(() => Promise.resolve(mockPipActive)),
}))

describe('SaveToast', () => {
  beforeEach(() => {
    mockParams = new URLSearchParams()
    mockPipActive = false
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows a hint when opened with no url param', () => {
    render(<SaveToast />)
    const stage = screen.getByTestId('save-toast')
    const labelSpans = stage.querySelectorAll('[aria-live="polite"] > span')
    const joined = Array.from(labelSpans).map((s) => s.textContent).join('')
    expect(joined).toBe('ブックマークレットから開いてください')
  })

  it('renders saving state with ring indicator initially', () => {
    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
    })
    render(<SaveToast />)
    const stage = screen.getByTestId('save-toast')
    expect(stage.getAttribute('data-state')).toBe('saving')
    expect(stage.querySelector('[data-role="ring"]')).toBeTruthy()
  })

  it('fast-closes after IDB write completes (popup is just an IDB-write bridge)', async () => {
    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
    })
    const closeMock = vi.fn()
    Object.defineProperty(window, 'close', { value: closeMock, configurable: true, writable: true })

    render(<SaveToast />)

    // Should close fast (~80ms after IDB write). State stays at 'saving'
    // because the toast animation never advances.
    await waitFor(
      () => {
        expect(closeMock).toHaveBeenCalledTimes(1)
      },
      { timeout: 500 },
    )
    expect(screen.getByTestId('save-toast').getAttribute('data-state')).toBe('saving')
  })

  it('shows error state and waits longer when IDB write fails', async () => {
    // Override the indexeddb mock for this test only
    const { addBookmark } = await import('@/lib/storage/indexeddb')
    vi.mocked(addBookmark).mockRejectedValueOnce(new Error('IDB write failed'))

    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
    })
    const closeMock = vi.fn()
    Object.defineProperty(window, 'close', { value: closeMock, configurable: true, writable: true })

    render(<SaveToast />)

    // Error state appears
    await waitFor(
      () => {
        expect(screen.getByTestId('save-toast').getAttribute('data-state')).toBe('error')
      },
      { timeout: 500 },
    )
    // Close hasn't fired yet (error path waits ~2.6s)
    expect(closeMock).not.toHaveBeenCalled()
  })

  it('legacy compatibility: previous PiP-active fast-close path still applies', async () => {
    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
    })
    mockPipActive = true
    const closeMock = vi.fn()
    Object.defineProperty(window, 'close', { value: closeMock, configurable: true, writable: true })

    render(<SaveToast />)

    // Should close fast — well under the ~600ms it would take to reach the 'saved'
    // animation state in the PiP-inactive path.
    await waitFor(
      () => {
        expect(closeMock).toHaveBeenCalledTimes(1)
      },
      { timeout: 500 },
    )

    // State should still be 'saving' when close fired (toast animation skipped).
    expect(screen.getByTestId('save-toast').getAttribute('data-state')).toBe('saving')
  })
})
