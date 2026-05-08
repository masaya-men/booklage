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

  it('uses 320x320 square popup dims', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('width=320')
    expect(uri).toContain('height=320')
  })

  it('positions popup at bottom-right via dynamic left + top calc (20px inset)', () => {
    // Note: the popup is now only opened in the fallback path (probe timeout
    // or pipActive=false). Dimension assertions still apply to that fallback.
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    // Right edge: availWidth - 320 - 20 = availWidth - 340
    expect(uri).toContain('screen.availWidth-340')
    // Bottom edge: availHeight - 320 - 20 = availHeight - 340
    expect(uri).toContain('screen.availHeight-340')
    // Old centred-bottom math must be gone
    expect(uri).not.toContain('(screen.width-240)/2')
    expect(uri).not.toContain('sh-154')
  })

  it('includes Booklage origin', () => {
    // The new IIFE stores the app origin in a var (`A`) and concatenates
    // path suffixes at runtime, so the origin and `/save` no longer appear
    // adjacent in the source. Assert both pieces are present instead.
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('https://booklage.pages.dev')
    expect(uri).toContain('/save')
  })

  it('iframe path: contains /save-iframe?bookmarklet=1', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('/save-iframe?bookmarklet=1')
  })

  it('contains booklage:probe and booklage:save message types', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('booklage:probe')
    expect(uri).toContain('booklage:save')
  })

  it('still contains a window.open(/save?...) fallback path', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toMatch(/\.open\([^)]*\/save\?/)
  })

  it('reads booklage:probe:result and booklage:save:result responses', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('booklage:probe:result')
    expect(uri).toContain('booklage:save:result')
  })

  it('IIFE source contains the same OGP selectors as extractOgpFromDocument', () => {
    // Source-level drift check: ensure the inline IIFE references all the
    // same OGP meta selectors as the TS extractor. Behavioral parity is
    // not asserted here (the IIFE is async and not synchronously runnable),
    // but selector text is the most common drift surface.
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

  it('hidden iframe has invisible cssText (no visual artifact while probing)', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('position:fixed')
    expect(uri).toContain('left:-9999px')
    expect(uri).toContain('opacity:0')
    expect(uri).toContain('pointer-events:none')
  })

  it('600ms probe timeout triggers popup fallback', () => {
    // Source-level check: the setTimeout(...,600) call must exist and be
    // followed by the popup-fallback path.
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('600')
    // The popup fallback is wired through window.open(...'/save?'...)
    expect(uri).toMatch(/\.open\([^)]*\/save\?/)
  })

  it('arms a 1500ms save-result deadline distinct from the 600ms probe timeout', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('1500')
  })

  it('cleans up via removeEventListener (not just iframe removal)', () => {
    const uri = generateBookmarkletUri('https://booklage.pages.dev')
    expect(uri).toContain('removeEventListener')
  })
})
