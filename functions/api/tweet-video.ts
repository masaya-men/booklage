interface PagesContext {
  request: Request
}

/** Hostnames we are willing to relay video bytes from. Anything else is
 *  rejected to keep this from being repurposed as an open proxy. */
const ALLOWED_HOSTS = new Set<string>([
  'video.twimg.com',
])

/**
 * Server-side proxy for Twitter video CDN.
 *
 * Why this exists: `video.twimg.com` rejects browser fetches whose
 * Referer points at non-Twitter origins, so a `<video src="https://video.twimg.com/...">`
 * served from `booklage.pages.dev` fails to load metadata and the
 * onError handler fires before the user can even press play.
 * `referrerpolicy="no-referrer"` is not enough on its own; the CDN
 * appears to also gate on Origin / Sec-Fetch-Site for some clips.
 *
 * The fix: route the video through this Pages Function. Cloudflare's
 * fetch from the edge does NOT carry a browser Referer / Origin, so
 * the CDN sees a clean server-to-server request and serves the bytes.
 * We then relay them back with permissive CORS so the <video> element
 * can stream them.
 *
 * Range support: HTML5 video issues `Range: bytes=...` requests for
 * seeking and chunked playback. We forward Range untouched and pass
 * the upstream's Content-Range / 206 status straight through, which
 * gives the player random-access seeking just like a direct fetch.
 *
 * Endpoint: GET /api/tweet-video?url=<encoded video.twimg.com url>
 *   Cache-Control: 1 day at the edge — Twitter's clip URLs are stable
 *   for the lifetime of the tweet, so caching is safe and saves
 *   bandwidth on rewatch.
 */
export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url).searchParams.get('url')
  if (!url) {
    return errorResponse('url query param is required', 400)
  }

  let parsed: URL
  try { parsed = new URL(url) }
  catch { return errorResponse('invalid url', 400) }

  if (parsed.protocol !== 'https:') {
    return errorResponse('only https upstream allowed', 400)
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return errorResponse('upstream host not allowed', 403)
  }

  const upstreamHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; AllMarks/1.0)',
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
      return errorResponse(`upstream ${upstream.status}`, upstream.status === 404 ? 404 : 502)
    }

    const responseHeaders = new Headers()
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
      const v = upstream.headers.get(h)
      if (v) responseHeaders.set(h, v)
    }
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
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
