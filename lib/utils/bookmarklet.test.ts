import { describe, it, expect } from 'vitest'
import { extractOgpFromDocument, generateBookmarkletUri } from './bookmarklet'

describe('extractOgpFromDocument', () => {
  function makeDoc(html: string, href = 'https://example.com/page'): Document {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<!DOCTYPE html><html><head>${html}</head><body></body></html>`, 'text/html')
    // jsdom's parsed document has `location` as a non-configurable own property,
    // so we wrap it in a Proxy to intercept location access.
    const fakeLocation = new URL(href)
    const proxy = new Proxy(doc, {
      get(target, prop, receiver) {
        if (prop === 'location') return fakeLocation
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
      },
    })
    return proxy as Document
  }

  it('extracts og:title, og:image, og:description, og:site_name from meta tags', () => {
    const doc = makeDoc(`
      <meta property="og:title" content="Example Title" />
      <meta property="og:image" content="https://cdn.example.com/og.png" />
      <meta property="og:description" content="Example description" />
      <meta property="og:site_name" content="Example Site" />
      <title>Fallback Title</title>
    `)
    const ogp = extractOgpFromDocument(doc)
    expect(ogp.title).toBe('Example Title')
    expect(ogp.image).toBe('https://cdn.example.com/og.png')
    expect(ogp.description).toBe('Example description')
    expect(ogp.siteName).toBe('Example Site')
  })

  it('falls back to document.title when og:title is missing', () => {
    const doc = makeDoc(`<title>Fallback Title</title>`)
    expect(extractOgpFromDocument(doc).title).toBe('Fallback Title')
  })

  it('falls back to URL when both og:title and document.title are missing', () => {
    const doc = makeDoc(``, 'https://example.com/page')
    expect(extractOgpFromDocument(doc).title).toBe('https://example.com/page')
  })

  it('falls back to twitter:image when og:image is missing', () => {
    const doc = makeDoc(`<meta name="twitter:image" content="https://cdn.example.com/twitter.png" />`)
    expect(extractOgpFromDocument(doc).image).toBe('https://cdn.example.com/twitter.png')
  })

  it('falls back to meta[name=description] when og:description is missing', () => {
    const doc = makeDoc(`<meta name="description" content="Plain description" />`)
    expect(extractOgpFromDocument(doc).description).toBe('Plain description')
  })

  it('falls back to hostname when og:site_name is missing', () => {
    const doc = makeDoc(``, 'https://news.example.com/article')
    expect(extractOgpFromDocument(doc).siteName).toBe('news.example.com')
  })

  it('truncates description to 200 characters', () => {
    const long = 'a'.repeat(500)
    const doc = makeDoc(`<meta property="og:description" content="${long}" />`)
    expect(extractOgpFromDocument(doc).description.length).toBe(200)
  })

  it('resolves relative favicon to absolute URL', () => {
    const doc = makeDoc(`<link rel="icon" href="/favicon.png" />`, 'https://example.com/page')
    expect(extractOgpFromDocument(doc).favicon).toBe('https://example.com/favicon.png')
  })

  it('keeps absolute favicon URLs as-is', () => {
    const doc = makeDoc(`<link rel="icon" href="https://cdn.example.com/fav.ico" />`)
    expect(extractOgpFromDocument(doc).favicon).toBe('https://cdn.example.com/fav.ico')
  })

  it('uses shortcut icon when icon is missing', () => {
    const doc = makeDoc(`<link rel="shortcut icon" href="https://cdn.example.com/short.ico" />`)
    expect(extractOgpFromDocument(doc).favicon).toBe('https://cdn.example.com/short.ico')
  })

  it('defaults favicon to absolute /favicon.ico when no link tags exist', () => {
    const doc = makeDoc(``, 'https://example.com/deep/path')
    expect(extractOgpFromDocument(doc).favicon).toBe('https://example.com/favicon.ico')
  })

  it('returns url field from document.location.href', () => {
    const doc = makeDoc(``, 'https://example.com/article?id=1')
    expect(extractOgpFromDocument(doc).url).toBe('https://example.com/article?id=1')
  })
})

describe('generateBookmarkletUri', () => {
  it('returns a URI starting with "javascript:"', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri.startsWith('javascript:')).toBe(true)
  })

  it('includes the provided appUrl in the output', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('https://booklage.pages.dev')
  })

  it('uses a different appUrl when provided', () => {
    const uri = generateBookmarkletUri('http://localhost:3000')
    expect(uri).toContain('http://localhost:3000')
    expect(uri).not.toContain('booklage.pages.dev')
  })

  it('produces a URI shorter than 2000 characters', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri.length).toBeLessThan(2000)
  })

  it('contains the /save path reference', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('/save')
  })

  it('is wrapped in an IIFE (function invocation)', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toMatch(/\(function\(\)\{[\s\S]*\}\)\(\);?$/)
  })

  it('uses 240x200 popup dims (smaller than PiP 256x286 outer so it tucks behind)', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('width=240')
    expect(uri).toContain('height=200')
  })

  it('positions popup at bottom-right corner where PiP companion sits', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    // Right edge: availWidth - 240 - 20 inset = availWidth - 260
    expect(uri).toContain('screen.availWidth-260')
    // Bottom edge: availHeight - 200 - 20 inset = availHeight - 220
    expect(uri).toContain('screen.availHeight-220')
    // Old larger-popup math must be gone
    expect(uri).not.toContain('screen.availWidth-340')
    expect(uri).not.toContain('screen.availHeight-340')
  })

  it('includes Booklage origin and /save popup path', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('https://booklage.pages.dev/save?')
  })

  it('opens via window.open (popup-only, no iframe)', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('window.open(')
    // Iframe-mediated silent save is gone (Chrome storage partitioning made
    // it unworkable: 3rd-party-embedded booklage iframe lives in a different
    // partition than the booklage main tab + PiP).
    expect(uri).not.toContain('/save-iframe?bookmarklet=1')
    expect(uri).not.toContain('createElement(\'iframe\'')
    expect(uri).not.toContain('booklage:probe')
  })

  it('IIFE source contains the same OGP selectors as extractOgpFromDocument', () => {
    // Source-level drift check: ensure the inline IIFE references all the
    // same OGP meta selectors as the TS extractor.
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('og:title')
    expect(uri).toContain('og:image')
    expect(uri).toContain('twitter:image')
    expect(uri).toContain('og:description')
    expect(uri).toContain('og:site_name')
    expect(uri).toContain('link[rel="icon"]')
    expect(uri).toContain('link[rel="shortcut icon"]')
    expect(uri).toContain('/favicon.ico')
  })
})
