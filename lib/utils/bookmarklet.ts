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
 * Parent-page toast + minimal-popup flow:
 *   1) Extract OGP inline (parity with extractOgpFromDocument).
 *   2) Open <APP>/save?... popup at bottom-right (Chrome may override
 *      position/size; the popup fast-closes within ~80ms via /save's logic).
 *   3) Inject a Shadow-DOM-isolated toast into the user's current page DOM:
 *      "Booklage に保存中…" → "Booklage に保存しました ✓" → fade out (~2.2s).
 *      Shadow DOM (closed) keeps host-page CSS from bleeding in. The toast
 *      is the primary visible feedback, so the popup can flash and close
 *      almost imperceptibly.
 *
 * Why a popup is still needed: Chrome's storage partitioning (Chrome 115+)
 * isolates booklage-origin iframes embedded in 3rd-party pages from the
 * booklage main tab + PiP. The popup opens a top-level booklage tab where
 * IDB and BroadcastChannel work in the {booklage, booklage} partition,
 * which is the only Web-platform path to save from 3rd-party context.
 * Service workers and Storage Access API are also partitioned and don't
 * reliably bridge the gap. → For zero-popup silent save, install the
 * Booklage Chrome extension (Ctrl+Shift+B + cursor pill).
 *
 * Keep this in sync with extractOgpFromDocument.
 */
const BOOKMARKLET_SOURCE = `(function(){var d=document,l=location,m=function(s){var e=d.querySelector(s);return e?e.getAttribute('content')||'':'';},k=function(s){var e=d.querySelector(s);return e?e.getAttribute('href')||'':'';},u=l.href,t=m('meta[property="og:title"]')||d.title||u,i=m('meta[property="og:image"]')||m('meta[name="twitter:image"]')||'',ds=(m('meta[property="og:description"]')||m('meta[name="description"]')||'').slice(0,200),sn=m('meta[property="og:site_name"]')||l.hostname,f=k('link[rel="icon"]')||k('link[rel="shortcut icon"]')||'/favicon.ico';if(f&&!/^https?:/.test(f)){try{f=new URL(f,u).href}catch(e){f=''}}var p=new URLSearchParams({url:u,title:t,image:i,desc:ds,site:sn,favicon:f}),W=200,H=160;window.open('__APP_URL__/save?'+p.toString(),'booklage-save','width='+W+',height='+H+',left='+Math.max(0,screen.availWidth-W-20)+',top='+Math.max(0,screen.availHeight-H-20)+',toolbar=0,menubar=0,location=0,status=0,resizable=0,scrollbars=0');var h=d.createElement('div');h.style.cssText='all:initial;position:fixed;top:16px;right:16px;z-index:2147483647';d.body.appendChild(h);var sh=h.attachShadow?h.attachShadow({mode:'closed'}):h,P=d.createElement('div');P.style.cssText='padding:10px 16px;border-radius:20px;background:rgba(18,18,22,.92);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.1);box-shadow:0 8px 24px rgba(0,0,0,.32);font:500 13px system-ui,sans-serif;color:rgba(255,255,255,.94);opacity:0;transition:opacity .2s';P.textContent='Booklage に保存中…';sh.appendChild(P);setTimeout(function(){P.style.opacity='1'},20);setTimeout(function(){P.textContent='Booklage に保存しました ✓'},500);setTimeout(function(){P.style.opacity='0'},2200);setTimeout(function(){try{d.body.removeChild(h)}catch(e){}},2500)})();`

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
