import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'

async function extract(html: string, baseUrl = 'https://example.com/page'): Promise<unknown> {
  const dom = new JSDOM(html, { url: baseUrl })
  const orig = {
    document: globalThis.document,
    location: globalThis.location,
    window: globalThis.window,
  }
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true })
  Object.defineProperty(globalThis, 'location', { value: dom.window.location, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true })
  try {
    const mod = await import('../../extension/lib/ogp.js')
    return mod.extractOgp()
  } finally {
    if (orig.document) Object.defineProperty(globalThis, 'document', { value: orig.document, configurable: true })
    if (orig.location) Object.defineProperty(globalThis, 'location', { value: orig.location, configurable: true })
    if (orig.window) Object.defineProperty(globalThis, 'window', { value: orig.window, configurable: true })
  }
}

interface OgpResult {
  url: string
  title: string
  image: string
  description: string
  siteName: string
  favicon: string
}

describe('OGP extraction (extension/lib/ogp.js)', () => {
  it('reads og:title, og:image, og:description, og:site_name, link[rel=icon]', async () => {
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="Example title" />
      <meta property="og:image" content="https://example.com/img.png" />
      <meta property="og:description" content="An example" />
      <meta property="og:site_name" content="Example Site" />
      <link rel="icon" href="/icon.png" />
      </head><body></body></html>`
    const r = (await extract(html)) as OgpResult
    expect(r.title).toBe('Example title')
    expect(r.image).toBe('https://example.com/img.png')
    expect(r.description).toBe('An example')
    expect(r.siteName).toBe('Example Site')
    expect(r.favicon).toBe('https://example.com/icon.png')
  })

  it('falls back to document.title when og:title is missing', async () => {
    const html = `<!DOCTYPE html><html><head><title>Fallback</title></head></html>`
    const r = (await extract(html)) as OgpResult
    expect(r.title).toBe('Fallback')
  })

  it('falls back to twitter:image when og:image is missing', async () => {
    const html = `<!DOCTYPE html><html><head>
      <meta name="twitter:image" content="https://x.com/i.jpg" /></head></html>`
    const r = (await extract(html)) as OgpResult
    expect(r.image).toBe('https://x.com/i.jpg')
  })

  it('falls back to meta[name=description] when og:description is missing', async () => {
    const html = `<!DOCTYPE html><html><head>
      <meta name="description" content="Plain description" /></head></html>`
    const r = (await extract(html)) as OgpResult
    expect(r.description).toBe('Plain description')
  })

  it('falls back to hostname when og:site_name is missing', async () => {
    const r = (await extract('<!DOCTYPE html>', 'https://news.example.com/article')) as OgpResult
    expect(r.siteName).toBe('news.example.com')
  })

  it('clamps description to 200 chars', async () => {
    const long = 'a'.repeat(300)
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:description" content="${long}" /></head></html>`
    const r = (await extract(html)) as OgpResult
    expect(r.description).toHaveLength(200)
  })

  it('uses shortcut icon when icon is missing', async () => {
    const html = `<!DOCTYPE html><html><head>
      <link rel="shortcut icon" href="https://cdn.example.com/short.ico" /></head></html>`
    const r = (await extract(html)) as OgpResult
    expect(r.favicon).toBe('https://cdn.example.com/short.ico')
  })

  it('defaults favicon to absolute /favicon.ico when no link tags exist', async () => {
    const r = (await extract('<!DOCTYPE html>', 'https://example.com/deep/path')) as OgpResult
    expect(r.favicon).toBe('https://example.com/favicon.ico')
  })

  it('returns url field from location.href', async () => {
    const r = (await extract('<!DOCTYPE html>', 'https://example.com/article?id=1')) as OgpResult
    expect(r.url).toBe('https://example.com/article?id=1')
  })
})
