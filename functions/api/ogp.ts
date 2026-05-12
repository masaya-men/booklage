interface PagesContext {
  request: Request
}

// Local copy — Pages Functions can't import from @/lib.
// Mirror of lib/utils/url-resolve.ts — keep in sync.
function resolveMaybeRelative(href: string, baseUrl: string): string {
  if (!href) return ''
  if (/^https?:\/\//i.test(href)) return href
  if (href.startsWith('//')) return `https:${href}`
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}

function extractMeta(html: string, property: string): string {
  const ogMatch = html.match(
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
  )
  if (ogMatch) return ogMatch[1]

  const ogReversed = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`,
      'i',
    ),
  )
  if (ogReversed) return ogReversed[1]

  const nameMatch = html.match(
    new RegExp(
      `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
  )
  if (nameMatch) return nameMatch[1]

  const nameReversed = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${property}["']`,
      'i',
    ),
  )
  if (nameReversed) return nameReversed[1]

  return ''
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match?.[1]?.trim() ?? ''
}

function extractFavicon(html: string, baseUrl: string): string {
  const match = html.match(
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']*)["']/i,
  )
  const raw = match?.[1] ?? ''
  const resolved = resolveMaybeRelative(raw, baseUrl)
  if (resolved) return resolved
  try {
    return `${new URL(baseUrl).origin}/favicon.ico`
  } catch {
    return ''
  }
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url).searchParams.get('url')
  if (!url) {
    return jsonResponse({ error: 'url parameter required' }, 400)
  }

  try {
    new URL(url)
  } catch {
    return jsonResponse({ error: 'Invalid URL format' }, 400)
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BooklageBot/1.0)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return jsonResponse({ error: `Fetch failed: ${res.status}` }, 502)
    }

    const html = await res.text()

    const rawImage = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image')
    const data = {
      title: extractMeta(html, 'og:title') || extractTitle(html),
      description:
        extractMeta(html, 'og:description') || extractMeta(html, 'description'),
      image: resolveMaybeRelative(rawImage, url),
      siteName: extractMeta(html, 'og:site_name'),
      favicon: extractFavicon(html, url),
      url,
    }

    return jsonResponse(data, 200, {
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
}
