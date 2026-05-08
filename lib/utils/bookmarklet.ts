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
 * Probe-then-save flow:
 *   1) Extract OGP inline from document (parity with extractOgpFromDocument).
 *   2) Inject hidden iframe at <APP>/save-iframe?bookmarklet=1.
 *   3) On iframe.onload, postMessage `booklage:probe`.
 *   4) Wait up to 600ms for `booklage:probe:result`:
 *      - pipActive: true  -> set D=1, postMessage `booklage:save`, arm 1500ms
 *                            save-result deadline. On save:result set Q=1 +
 *                            cleanup (silent in-app save).
 *      - pipActive: false -> immediate cleanup + popup fallback (F).
 *      - timeout (D=0)    -> cleanup + popup fallback.
 *
 * Two-flag state machine:
 *   - D=1 once save is in flight (gates probe-timeout no-op + probe re-entry)
 *   - Q=1 once fully resolved (gates message handler + 1500ms save deadline)
 *
 * Cross-partition note: Chrome's storage partitioning (115+) would normally
 * isolate the iframe (3rd-party context) from the booklage main tab + PiP.
 * The iframe at /save-iframe?bookmarklet=1 calls
 * `document.requestStorageAccess({all: true})` on mount which Chrome 124+
 * auto-grants without prompt when the user has visited booklage as a
 * first-party recently. The grant unpartitions the iframe's IDB + BC so
 * it shares the {booklage, booklage} partition with the booklage tab + PiP.
 * If the grant fails (older browsers, no first-party history), the probe
 * times out and the bookmarklet falls back to the popup.
 *
 * Keep this in sync with extractOgpFromDocument. The 2000-char heuristic
 * (after __APP_URL__ substitution with https://booklage.pages.dev) is a
 * safety target.
 */
const BOOKMARKLET_SOURCE = `(function(){var d=document,l=location,W=window,g=function(s){var e=d.querySelector(s);return e?e.getAttribute('content')||'':'';},h=function(s){var e=d.querySelector(s);return e?e.getAttribute('href')||'':'';},u=l.href,t=g('meta[property="og:title"]')||d.title||u,i=g('meta[property="og:image"]')||g('meta[name="twitter:image"]')||'',ds=(g('meta[property="og:description"]')||g('meta[name="description"]')||'').slice(0,200),sn=g('meta[property="og:site_name"]')||l.hostname,f=h('link[rel="icon"]')||h('link[rel="shortcut icon"]')||'/favicon.ico';if(f&&!/^https?:/.test(f)){try{f=new URL(f,u).href}catch(e){f=''}}var A='__APP_URL__',n='b'+Date.now()+Math.random().toString(36).slice(2,7),D=0,Q=0,fr=d.createElement('iframe'),P=function(){var p=new URLSearchParams({url:u,title:t,image:i,desc:ds,site:sn,favicon:f});W.open(A+'/save?'+p.toString(),'booklage-save','width=320,height=320,left='+Math.max(0,screen.availWidth-340)+',top='+Math.max(0,screen.availHeight-340)+',toolbar=0,menubar=0,location=0,status=0,resizable=0,scrollbars=0')},C=function(){try{d.body.removeChild(fr)}catch(e){}W.removeEventListener('message',M)},F=function(){D=Q=1;C();P()},M=function(e){if(Q||e.source!==fr.contentWindow)return;var z=e.data;if(!z||typeof z!=='object')return;if(z.type==='booklage:probe:result'&&z.nonce==='p'+n){if(D)return;if(z.pipActive){D=1;fr.contentWindow.postMessage({type:'booklage:save',payload:{url:u,title:t,description:ds,image:i,favicon:f,siteName:sn,nonce:n}},A);setTimeout(function(){Q||F()},1500)}else F()}else if(z.type==='booklage:save:result'&&z.nonce===n){D=Q=1;C()}};fr.style.cssText='position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';fr.src=A+'/save-iframe?bookmarklet=1';W.addEventListener('message',M);fr.onload=function(){fr.contentWindow.postMessage({type:'booklage:probe',payload:{nonce:'p'+n}},A);setTimeout(function(){if(!D)F()},600)};fr.onerror=function(){if(!D)F()};d.body.appendChild(fr)})();`

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
