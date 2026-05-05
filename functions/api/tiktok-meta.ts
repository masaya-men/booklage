interface PagesContext {
  request: Request
}

/**
 * Server-side scraper that extracts a playable mp4 URL + cover image from a
 * TikTok video page. Mirrors the strategy used by yt-dlp's TikTok extractor
 * (see https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/tiktok.py).
 *
 * Why a server-side scrape:
 *   - TikTok's official `tiktok.com/embed/v2/<id>` iframe stuffs the player
 *     inside their own UI chrome (related-videos sidebar, "今すぐ見る" CTA
 *     banner, scrollbar, profile header) which CSS cannot suppress because
 *     the iframe is cross-origin.
 *   - The oEmbed endpoint only returns embed HTML + thumbnail — no mp4.
 *   - The Display API requires user OAuth, which Booklage doesn't have.
 *   - The mp4 lives inside `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON
 *     embedded in the public video page HTML. Anyone hitting the URL with
 *     a real-browser-shaped fetch can read it.
 *
 * Risks (compared to the Twitter syndication path):
 *   - TikTok runs an active WAF that challenges datacenter-egress IPs on
 *     repeated hits. Cloudflare Pages Functions may get challenged after
 *     bursts. We send realistic browser headers to soften this; if it
 *     still fails, the client-side caller (Lightbox TikTokEmbed) gracefully
 *     falls back to TikTok's own embed iframe.
 *   - The JSON shape can shift with TikTok deploys. We catch parse errors
 *     and return 502, again handing off to the client-side fallback.
 *
 * Endpoint: GET /api/tiktok-meta?url=<full TikTok video URL>
 *   Response (200): { playAddr, cover, dynamicCover, duration, width, height }
 *   Cache: 1 hour at the edge — playAddr URLs do expire (they're signed)
 *   but TikTok refreshes them on each scrape, so caching the JSON for an
 *   hour is safe.
 */

const SCRIPT_REGEX =
  /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([^<]+)<\/script>/

// A real-browser User-Agent matters: TikTok's WAF immediately challenges
// requests with obvious bot UAs. We rotate among a small set of recent
// Chrome / Firefox UAs to avoid being too predictable.
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
]

function pickUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ?? USER_AGENTS[0]!
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const targetUrl = new URL(context.request.url).searchParams.get('url')
  if (!targetUrl) {
    return errorResponse('url query param is required', 400)
  }

  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return errorResponse('invalid url', 400)
  }

  if (parsed.protocol !== 'https:') {
    return errorResponse('only https tiktok urls allowed', 400)
  }
  if (!parsed.hostname.endsWith('tiktok.com')) {
    return errorResponse('only tiktok.com urls allowed', 403)
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': pickUA(),
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    })

    if (!upstream.ok) {
      return errorResponse(`upstream ${upstream.status}`, 502)
    }

    const html = await upstream.text()
    const match = html.match(SCRIPT_REGEX)
    if (!match || !match[1]) {
      // Page reached us but the rehydration script wasn't there. Almost
      // always means the WAF served us a stub / login wall. Returning 502
      // lets the client-side caller fall through to the iframe fallback.
      return errorResponse('rehydration data missing — likely WAF challenge', 502)
    }

    let data: unknown
    try {
      data = JSON.parse(decodeHtmlEntities(match[1]))
    } catch {
      return errorResponse('rehydration json malformed', 502)
    }

    const result = extractPlayback(data)
    if (!result) {
      return errorResponse('no playable mp4 in rehydration json', 404)
    }

    return jsonResponse(result, 200, {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return errorResponse(message, 500)
  }
}

/** TikTok escapes a few characters in the embedded JSON (notably `&amp;`,
 *  `&lt;`, `&gt;`, `&quot;`). JSON.parse needs them decoded back. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
}

/** Drill into the rehydration JSON to pull `video.playAddr` etc. The path
 *  has been stable for ~2 years but we tolerate missing fields gracefully. */
function extractPlayback(data: unknown): {
  playAddr: string
  cover: string
  dynamicCover: string
  duration: number
  width: number
  height: number
} | null {
  if (!isObject(data)) return null
  const scope = (data as Record<string, unknown>)['__DEFAULT_SCOPE__']
  if (!isObject(scope)) return null
  const detail = (scope as Record<string, unknown>)['webapp.video-detail']
  if (!isObject(detail)) return null
  const itemInfo = (detail as Record<string, unknown>)['itemInfo']
  if (!isObject(itemInfo)) return null
  const itemStruct = (itemInfo as Record<string, unknown>)['itemStruct']
  if (!isObject(itemStruct)) return null
  const video = (itemStruct as Record<string, unknown>)['video']
  if (!isObject(video)) return null

  const playAddr =
    pickString(video, 'playAddr') ??
    pickString(video, 'downloadAddr') ??
    null
  if (!playAddr) return null

  return {
    playAddr,
    cover: pickString(video, 'cover') ?? '',
    dynamicCover: pickString(video, 'dynamicCover') ?? '',
    duration: pickNumber(video, 'duration') ?? 0,
    width: pickNumber(video, 'width') ?? 0,
    height: pickNumber(video, 'height') ?? 0,
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function pickString(o: Record<string, unknown>, k: string): string | null {
  const v = o[k]
  return typeof v === 'string' && v.length > 0 ? v : null
}

function pickNumber(o: Record<string, unknown>, k: string): number | null {
  const v = o[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...headers,
    },
  })
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status)
}
