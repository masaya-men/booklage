interface PagesContext {
  request: Request
}

/**
 * Server-side proxy for TikTok video CDN — analogous to tweet-video.ts
 * but with TikTok's required Referer header.
 *
 * Why this exists:
 *   `playAddr` URLs returned by tiktok-meta.ts point at the TikTok CDN
 *   (e.g. `v16-webapp.tiktok.com`, `v77.tiktokcdn.com`,
 *   `v45-default.akamaized.net`, etc.). Those CDN endpoints reject
 *   requests whose Referer is not `https://www.tiktok.com/` — a
 *   `<video src="https://v77.tiktokcdn.com/...">` served from
 *   `booklage.pages.dev` is therefore blocked at load time. Browsers
 *   cannot set Referer to a foreign origin (correct security policy).
 *
 *   The fix is the same trick we use for Twitter's `video.twimg.com`:
 *   stream the bytes through this Pages Function, which IS allowed to
 *   set Referer to whatever it wants. The CDN sees a clean request from
 *   a server that claims to be tiktok.com and serves the bytes.
 *
 * Range support: forwarded untouched so HTML5 video seeking works.
 *
 * Endpoint: GET /api/tiktok-video?url=<encoded TikTok CDN url>
 *   Cache-Control: 24h at the edge — TikTok playAddr URLs are signed
 *   with a few-hour TTL but identical bytes can be re-served from edge
 *   cache safely; if the cache miss requires re-fetching the CDN for
 *   an expired URL, the upstream returns 403 and we propagate it so
 *   the client can re-scrape via tiktok-meta.ts.
 */

// TikTok serves video bytes from a small handful of CDN families.
// We use suffix matching so `v16-webapp.tiktok.com`, `v77.tiktokcdn.com`,
// `v45.tiktokcdn-us.com`, etc. all match. Anything else is rejected to
// keep this from being repurposed as an open proxy.
const ALLOWED_HOST_SUFFIXES: readonly string[] = [
  '.tiktok.com',
  '.tiktokcdn.com',
  '.tiktokcdn-us.com',
  '.tiktokv.com',
  '.byteoversea.com',
  '.akamaized.net',  // some clips route through Akamai
]

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOST_SUFFIXES.some((s) => hostname.endsWith(s))
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url).searchParams.get('url')
  if (!url) {
    return errorResponse('url query param is required', 400)
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return errorResponse('invalid url', 400)
  }

  if (parsed.protocol !== 'https:') {
    return errorResponse('only https upstream allowed', 400)
  }
  if (!isAllowedHost(parsed.hostname)) {
    return errorResponse('upstream host not allowed', 403)
  }

  const upstreamHeaders: Record<string, string> = {
    // Real-browser UA discourages CDN bot heuristics.
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    // The single most important header for TikTok CDNs — drop this and
    // every byte returns 403.
    Referer: 'https://www.tiktok.com/',
    Origin: 'https://www.tiktok.com',
    // Match the headers Chrome's <video> element sends when playing
    // a TikTok clip directly. Without these the CDN sometimes treats
    // the request as bot-flavored and 403s. Sec-Fetch-Dest: 'video' is
    // the strongest signal — it's what tells TikTok "this is a
    // browser playing media", not "this is curl".
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
  }
  // Cookie forwarding. TikTok's CDN binds the signed playAddr URL to the
  // session that issued it (tt_chain_token + a couple of supporting
  // cookies). Without those cookies the CDN returns 403 even when Referer
  // is correct. tiktok-meta.ts captured the Set-Cookie response from the
  // page fetch and the client passes it back to us as the `c` query
  // param; we forward it verbatim as a Cookie request header. URL-decode
  // because the client encoded for safe transport in a query string.
  const cookieParam = new URL(context.request.url).searchParams.get('c')
  if (cookieParam) {
    try {
      upstreamHeaders.Cookie = decodeURIComponent(cookieParam)
    } catch {
      /* malformed encoding — proceed without cookies; CDN will likely 403 */
    }
  }
  const range = context.request.headers.get('range')
  if (range) upstreamHeaders.Range = range

  try {
    const upstream = await fetch(parsed.toString(), {
      method: context.request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(30000),
    })

    if (!upstream.ok && upstream.status !== 206) {
      // Capture a snippet of the upstream response body for diagnostics.
      // CDN error pages are usually short HTML or JSON ≤ 2 KB. We expose
      // both the upstream status (in the X-Upstream-Status response
      // header so it's visible in the browser's network tab without
      // opening the response body) and the snippet (in the JSON body)
      // so when the client gets 502 we can tell at a glance whether
      // it's 403 (auth — cookie/Referer/IP problem), 410 (URL expired —
      // need to re-scrape), or a 5xx (CDN itself is down).
      let snippet = ''
      try {
        snippet = (await upstream.text()).slice(0, 1500)
      } catch {
        /* if body read fails, leave snippet empty */
      }
      return new Response(
        JSON.stringify({
          error: `upstream ${upstream.status}`,
          upstreamStatus: upstream.status,
          upstreamBody: snippet,
        }),
        {
          status: upstream.status === 404 ? 404 : 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-Upstream-Status': String(upstream.status),
          },
        },
      )
    }

    const responseHeaders = new Headers()
    for (const h of [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'last-modified',
      'etag',
    ]) {
      const v = upstream.headers.get(h)
      if (v) responseHeaders.set(h, v)
    }
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Accept-Ranges',
    )
    responseHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=86400')

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return errorResponse(message, 500)
  }
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
