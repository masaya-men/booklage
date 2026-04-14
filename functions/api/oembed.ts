interface PagesContext {
  request: Request
}

const OEMBED_ENDPOINTS: Record<string, string> = {
  youtube: 'https://www.youtube.com/oembed',
  tiktok: 'https://www.tiktok.com/oembed',
  instagram: 'https://api.instagram.com/oembed',
}

function detectProvider(url: string): string | null {
  const lower = url.toLowerCase()
  if (lower.includes('youtube.com') || lower.includes('youtu.be'))
    return 'youtube'
  if (lower.includes('tiktok.com')) return 'tiktok'
  if (lower.includes('instagram.com')) return 'instagram'
  return null
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

  const provider = detectProvider(url)
  if (!provider) {
    return jsonResponse({ error: 'Unsupported oEmbed provider' }, 400)
  }

  const endpoint = OEMBED_ENDPOINTS[provider]
  const oembedUrl = `${endpoint}?url=${encodeURIComponent(url)}&format=json`

  try {
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return jsonResponse({ error: `oEmbed failed: ${res.status}` }, 502)
    }

    const data: unknown = await res.json()

    return jsonResponse(data, 200, {
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
}
