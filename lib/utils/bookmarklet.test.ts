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

  it('inline JS matches extractOgpFromDocument semantics for a shared fixture', () => {
    // Shared fixture: HTML head with og:title, og:image, og:description, og:site_name, favicon
    const fixtureHead = `
      <meta property="og:title" content="Drift Check" />
      <meta property="og:image" content="https://cdn.example.com/og.png" />
      <meta property="og:description" content="Ensure inline JS produces same OGP as TS extractor" />
      <meta property="og:site_name" content="Drift Site" />
      <link rel="icon" href="/favicon.png" />
    `
    const fixtureHref = 'https://example.com/article?id=1'

    // 1. Run the TS extractor on a jsdom document
    const parser = new DOMParser()
    const tsDoc = parser.parseFromString(
      `<!DOCTYPE html><html><head>${fixtureHead}</head><body></body></html>`,
      'text/html',
    )
    // Provide a location proxy (same pattern as the top of this file's makeDoc helper)
    const tsDocProxy = new Proxy(tsDoc, {
      get(target, prop, receiver) {
        if (prop === 'location') return new URL(fixtureHref)
        const v = Reflect.get(target, prop, receiver)
        return typeof v === 'function' ? v.bind(target) : v
      },
    })
    const tsResult = extractOgpFromDocument(tsDocProxy as Document)

    // 2. Run the inline JS on a separate jsdom document by evaluating the IIFE with captured window.open
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    const iife = uri.replace(/^javascript:/, '')

    const inlineDoc = parser.parseFromString(
      `<!DOCTYPE html><html><head>${fixtureHead}</head><body></body></html>`,
      'text/html',
    )
    let capturedUrl = ''
    const fakeWindow = {
      open: (u: string) => { capturedUrl = u },
      URL: URL,
    }
    const fakeLocation = new URL(fixtureHref)
    // Run the IIFE with a shimmed `document`, `location`, `window`, `URLSearchParams`
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('document', 'location', 'window', 'URL', 'URLSearchParams', iife)(
      inlineDoc,
      fakeLocation,
      fakeWindow,
      URL,
      URLSearchParams,
    )

    // 3. Parse the opened URL and compare fields
    expect(capturedUrl.length).toBeGreaterThan(0)
    const openedUrl = new URL(capturedUrl)
    const params = openedUrl.searchParams
    expect(params.get('url')).toBe(tsResult.url)
    expect(params.get('title')).toBe(tsResult.title)
    expect(params.get('image')).toBe(tsResult.image)
    expect(params.get('desc')).toBe(tsResult.description)
    expect(params.get('site')).toBe(tsResult.siteName)
    expect(params.get('favicon')).toBe(tsResult.favicon)
  })
})
