import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

function extractMeta(html: string, property: string): string {
  // Try og: property first (property="og:...")
  const ogMatch = html.match(
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
  )
  if (ogMatch) return ogMatch[1]

  // Try reversed attribute order (content before property)
  const ogReversed = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`,
      'i',
    ),
  )
  if (ogReversed) return ogReversed[1]

  // Try name= fallback (name="description" etc.)
  const nameMatch = html.match(
    new RegExp(
      `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
  )
  if (nameMatch) return nameMatch[1]

  // Try reversed name fallback
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
  if (match) {
    const href = match[1]
    if (href.startsWith('http')) return href
    if (href.startsWith('//')) return `https:${href}`
    const origin = new URL(baseUrl).origin
    return `${origin}${href.startsWith('/') ? '' : '/'}${href}`
  }
  return `${new URL(baseUrl).origin}/favicon.ico`
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json(
      { error: 'url parameter required' },
      { status: 400 },
    )
  }

  try {
    new URL(url)
  } catch {
    return NextResponse.json(
      { error: 'Invalid URL format' },
      { status: 400 },
    )
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
      return NextResponse.json(
        { error: `Fetch failed: ${res.status}` },
        { status: 502 },
      )
    }

    const html = await res.text()

    const data = {
      title: extractMeta(html, 'og:title') || extractTitle(html),
      description:
        extractMeta(html, 'og:description') || extractMeta(html, 'description'),
      image: extractMeta(html, 'og:image'),
      siteName: extractMeta(html, 'og:site_name'),
      favicon: extractFavicon(html, url),
      url,
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
