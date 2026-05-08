export interface OgpData {
  readonly title: string
  readonly image: string
  readonly description: string
  readonly siteName: string
  readonly favicon: string
  readonly url: string
}

export function extractOgpFromDocument(doc: Document): OgpData {
  const meta = (selector: string): string => {
    const el = doc.querySelector(selector)
    return el?.getAttribute('content') ?? ''
  }
  const link = (selector: string): string => {
    const el = doc.querySelector(selector)
    return el?.getAttribute('href') ?? ''
  }

  const url = doc.location.href
  const title = meta('meta[property="og:title"]') || doc.title || url
  const image = meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || ''
  const description = (meta('meta[property="og:description"]') || meta('meta[name="description"]') || '').slice(0, 200)
  const siteName = meta('meta[property="og:site_name"]') || doc.location.hostname
  let favicon = link('link[rel="icon"]') || link('link[rel="shortcut icon"]') || '/favicon.ico'
  if (favicon && !/^https?:/.test(favicon)) {
    try {
      favicon = new URL(favicon, doc.location.href).href
    } catch {
      favicon = ''
    }
  }

  return { title, image, description, siteName, favicon, url }
}

/**
 * Inline bookmarklet source. Mirrors extractOgpFromDocument semantics but
 * written as a compact ES5-safe IIFE.
 *
 * Popup-tucked-behind-PiP flow:
 *   1) Extract OGP inline from document (parity with extractOgpFromDocument).
 *   2) Open <APP>/save?... in a small popup (240×200) positioned at the
 *      bottom-right corner, where the Document PiP companion (256×286 outer)
 *      naturally sits. When PiP is open, PiP covers the popup so the user
 *      sees only the new card sliding into PiP. When PiP is closed, the
 *      user sees a brief save-toast in the corner that auto-closes after
 *      ~2.1s (handled by /save page itself).
 *
 * Why popup, not silent iframe save: Chrome's storage partitioning
 * (Chrome 115+, Aug 2023) keys BroadcastChannel and IndexedDB by
 * top-level-site. A booklage-origin iframe embedded in a 3rd-party page
 * lives in the {3rd-party-site, booklage} partition — different from the
 * booklage main tab + PiP at {booklage, booklage}. So an iframe-mediated
 * save would write to a partition the booklage tab can't read, AND the
 * iframe can't observe BroadcastChannel events from PiP either. The popup
 * is a full top-level booklage tab, so it shares the {booklage, booklage}
 * partition — bookmark-saved propagates to PiP correctly.
 *
 * Keep this in sync with extractOgpFromDocument.
 */
const BOOKMARKLET_SOURCE = `(function(){var d=document,l=location,m=function(s){var e=d.querySelector(s);return e?e.getAttribute('content')||'':'';},k=function(s){var e=d.querySelector(s);return e?e.getAttribute('href')||'':'';},u=l.href,t=m('meta[property="og:title"]')||d.title||u,i=m('meta[property="og:image"]')||m('meta[name="twitter:image"]')||'',ds=(m('meta[property="og:description"]')||m('meta[name="description"]')||'').slice(0,200),sn=m('meta[property="og:site_name"]')||l.hostname,f=k('link[rel="icon"]')||k('link[rel="shortcut icon"]')||'/favicon.ico';if(f&&!/^https?:/.test(f)){try{f=new URL(f,u).href}catch(e){f=''}}var p=new URLSearchParams({url:u,title:t,image:i,desc:ds,site:sn,favicon:f});window.open('__APP_URL__/save?'+p.toString(),'booklage-save','width=240,height=200,left='+Math.max(0,screen.availWidth-260)+',top='+Math.max(0,screen.availHeight-220)+',toolbar=0,menubar=0,location=0,status=0,resizable=0,scrollbars=0')})();`

/**
 * Generate the `javascript:` URI for the Booklage bookmarklet.
 * @param appUrl — Booklage origin (e.g. https://booklage.pages.dev or http://localhost:3000)
 * @returns Full `javascript:...` URI ready to be placed in an `<a href>`
 */
export function generateBookmarkletUri(appUrl: string): string {
  // appUrl is embedded inside a JS single-quoted string literal in BOOKMARKLET_SOURCE.
  // Escape any single quote / backslash so the IIFE stays parseable for arbitrary origins.
  const escaped = appUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return 'javascript:' + BOOKMARKLET_SOURCE.replace('__APP_URL__', escaped)
}
