interface PagesContext {
  request: Request
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

/**
 * Mirror of react-tweet's token computation
 * (https://github.com/vercel/react-tweet/blob/main/packages/react-tweet/src/api/fetch-tweet.ts).
 * Required by `cdn.syndication.twimg.com/tweet-result` to authenticate the
 * unauthenticated public lookup.
 */
function computeToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, '')
}

/**
 * Server-side proxy for the Twitter syndication CDN.
 *
 * Why this proxy exists:
 *   `cdn.syndication.twimg.com/tweet-result` returns
 *   `Access-Control-Allow-Origin: https://platform.twitter.com`,
 *   which the browser strictly rejects from any other origin
 *   (e.g. `https://booklage.pages.dev`). Direct client-side fetch is
 *   therefore impossible. This Cloudflare Pages Function proxies the
 *   request server-to-server (no Origin header is sent by Workers `fetch`
 *   by default, so X happily serves the JSON), then relays it back with a
 *   permissive CORS header for the browser.
 *
 * Endpoint: GET /api/tweet-meta?id=<numeric-tweet-id>
 *   Response: raw syndication JSON (parsed by `lib/embed/tweet-meta.ts`)
 *   Cache: 1 hour at the edge (per-tweet metadata barely changes).
 */
export async function onRequest(context: PagesContext): Promise<Response> {
  const id = new URL(context.request.url).searchParams.get('id')
  if (!id || !/^\d+$/.test(id)) {
    return jsonResponse({ error: 'id must be a numeric tweet id' }, 400)
  }

  const token = computeToken(id)
  const upstream = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}&lang=en`

  try {
    const res = await fetch(upstream, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Booklage/1.0)',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return jsonResponse({ error: `upstream ${res.status}` }, res.status === 404 ? 404 : 502)
    }

    const data: unknown = await res.json()
    return jsonResponse(data, 200, {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
}
