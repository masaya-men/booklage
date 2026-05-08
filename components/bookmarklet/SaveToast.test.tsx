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

  it('transitions to saved state after IDB write + 600ms hold', async () => {
    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
    })
    render(<SaveToast />)
    await waitFor(
      () => {
        expect(screen.getByTestId('save-toast').getAttribute('data-state')).toBe('saved')
      },
      { timeout: 1500 },
    )
    expect(screen.getByTestId('save-toast').querySelector('[data-role="checkmark"]')).toBeTruthy()
  })

  it('renders bg image when image param is provided (after saved state)', async () => {
    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
      image: 'https://example.com/og.png',
    })
    render(<SaveToast />)
    const img = await waitFor(
      () => {
        const el = screen.getByTestId('save-toast').querySelector('img[data-role="bg-thumb"]')
        expect(el).toBeTruthy()
        return el
      },
      { timeout: 1500 },
    )
    expect(img?.getAttribute('src')).toBe('https://example.com/og.png')
  })

  it('does not render bg image when image param is empty', async () => {
    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
    })
    render(<SaveToast />)
    await waitFor(
      () => {
        expect(screen.getByTestId('save-toast').getAttribute('data-state')).toBe('saved')
      },
      { timeout: 1500 },
    )
    const img = screen.getByTestId('save-toast').querySelector('img[data-role="bg-thumb"]')
    expect(img).toBeNull()
  })

  it('transitions saved → recede → close at the right times (PiP not active)', async () => {
    mockParams = new URLSearchParams({
      url: 'https://example.com',
      title: 'Example',
    })
    mockPipActive = false
    const closeMock = vi.fn()
    Object.defineProperty(window, 'close', { value: closeMock, configurable: true, writable: true })

    render(<SaveToast />)

    await waitFor(
      () => {
        expect(screen.getByTestId('save-toast').getAttribute('data-state')).toBe('saved')
      },
      { timeout: 1500 },
    )
    expect(closeMock).not.toHaveBeenCalled()

    await waitFor(
      () => {
        expect(screen.getByTestId('save-toast').getAttribute('data-state')).toBe('recede')
      },
      { timeout: 2000 },
    )

    await waitFor(
      () => {
        expect(closeMock).toHaveBeenCalledTimes(1)
      },
      { timeout: 1000 },
    )
  })

  it('fast-closes within ~150ms when PiP is active (skips toast animation)', async () => {
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
