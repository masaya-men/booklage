import { describe, it, expect } from 'vitest'
import { parseSaveMessage, parseProbeMessage, parseProbeResult } from './save-message'

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

describe('parseProbeMessage', () => {
  it('accepts a valid booklage:probe envelope', () => {
    const result = parseProbeMessage({ type: 'booklage:probe', payload: { nonce: 'p-abc' } })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.payload.nonce).toBe('p-abc')
  })

  it('rejects probe with wrong type', () => {
    const result = parseProbeMessage({ type: 'booklage:save', payload: { nonce: 'p-abc' } })
    expect(result.ok).toBe(false)
  })

  it('rejects probe missing nonce', () => {
    const result = parseProbeMessage({ type: 'booklage:probe', payload: {} })
    expect(result.ok).toBe(false)
  })

  it('rejects probe with empty-string nonce', () => {
    const result = parseProbeMessage({ type: 'booklage:probe', payload: { nonce: '' } })
    expect(result.ok).toBe(false)
  })

  it('rejects null', () => {
    expect(parseProbeMessage(null).ok).toBe(false)
  })
})

describe('parseProbeResult', () => {
  it('accepts a valid booklage:probe:result with pipActive=true', () => {
    const result = parseProbeResult({ type: 'booklage:probe:result', nonce: 'p-abc', pipActive: true })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.nonce).toBe('p-abc')
      expect(result.value.pipActive).toBe(true)
    }
  })

  it('accepts pipActive=false', () => {
    const result = parseProbeResult({ type: 'booklage:probe:result', nonce: 'p-abc', pipActive: false })
    expect(result.ok).toBe(true)
  })

  it('rejects result with wrong type', () => {
    const result = parseProbeResult({ type: 'booklage:save:result', nonce: 'p-abc', pipActive: true })
    expect(result.ok).toBe(false)
  })

  it('rejects result missing nonce', () => {
    const result = parseProbeResult({ type: 'booklage:probe:result', pipActive: true })
    expect(result.ok).toBe(false)
  })

  it('rejects result with non-boolean pipActive', () => {
    const result = parseProbeResult({ type: 'booklage:probe:result', nonce: 'p-abc', pipActive: 'yes' })
    expect(result.ok).toBe(false)
  })
})
