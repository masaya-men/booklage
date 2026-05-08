import { describe, it, expect } from 'vitest'
import { parseSaveMessage } from './save-message'

describe('parseSaveMessage', () => {
  it('accepts a valid booklage:save payload', () => {
    const result = parseSaveMessage({
      type: 'booklage:save',
      payload: {
        url: 'https://example.com/article',
        title: 'Example',
        description: 'desc',
        image: 'https://example.com/og.png',
        favicon: 'https://example.com/favicon.ico',
        siteName: 'Example',
        nonce: 'abc-123',
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.payload.url).toBe('https://example.com/article')
      expect(result.value.payload.nonce).toBe('abc-123')
    }
  })

  it('rejects payloads with the wrong type', () => {
    const result = parseSaveMessage({
      type: 'something-else',
      payload: { url: 'https://example.com', title: 't', description: '', image: '', favicon: '', siteName: '', nonce: 'n' },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects payloads missing required url', () => {
    const result = parseSaveMessage({
      type: 'booklage:save',
      payload: { title: 't', description: '', image: '', favicon: '', siteName: '', nonce: 'n' },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects payloads with non-string url', () => {
    const result = parseSaveMessage({
      type: 'booklage:save',
      payload: { url: 123, title: 't', description: '', image: '', favicon: '', siteName: '', nonce: 'n' },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects null', () => {
    expect(parseSaveMessage(null).ok).toBe(false)
  })

  it('rejects non-object', () => {
    expect(parseSaveMessage('hello').ok).toBe(false)
  })

  it('accepts payload with empty optional fields', () => {
    const result = parseSaveMessage({
      type: 'booklage:save',
      payload: {
        url: 'https://example.com',
        title: 'Example',
        description: '',
        image: '',
        favicon: '',
        siteName: '',
        nonce: 'n',
      },
    })
    expect(result.ok).toBe(true)
  })
})
