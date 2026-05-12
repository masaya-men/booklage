// extension/lib/ogp.js
// INJECTED via chrome.scripting on the target tab.
// Mirrors lib/utils/bookmarklet.ts's extractOgpFromDocument exactly.
// NOTE: keep in sync with the inline copy inside extension/lib/dispatch.js
// (chrome.scripting.executeScript({func}) serializes the function source,
// so it cannot reach module-scoped helpers — the inline copy is required).
export function extractOgp() {
  const m = (s) => { const e = document.querySelector(s); return e ? e.getAttribute('content') || '' : '' }
  const k = (s) => { const e = document.querySelector(s); return e ? e.getAttribute('href') || '' : '' }
  const r = (h, b) => {
    if (!h) return ''
    if (/^https?:\/\//i.test(h)) return h
    if (h.startsWith('//')) return `https:${h}`
    try { return new URL(h, b).href } catch { return '' }
  }
  const url = location.href
  const title = m('meta[property="og:title"]') || document.title || url
  const image = r(m('meta[property="og:image"]') || m('meta[name="twitter:image"]') || '', url)
  const description = (m('meta[property="og:description"]') || m('meta[name="description"]') || '').slice(0, 200)
  const siteName = m('meta[property="og:site_name"]') || location.hostname
  const favicon = r(k('link[rel="icon"]') || k('link[rel="shortcut icon"]') || '/favicon.ico', url)
  return { url, title, image, description, siteName, favicon }
}
