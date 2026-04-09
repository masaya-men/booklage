import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

/** oEmbedプロバイダーのエンドポイントマッピング */
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json(
      { error: 'url parameter required' },
      { status: 400 },
    )
  }

  const provider = detectProvider(url)
  if (!provider) {
    return NextResponse.json(
      { error: 'Unsupported oEmbed provider' },
      { status: 400 },
    )
  }

  const endpoint = OEMBED_ENDPOINTS[provider]
  const oembedUrl = `${endpoint}?url=${encodeURIComponent(url)}&format=json`

  try {
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `oEmbed failed: ${res.status}` },
        { status: 502 },
      )
    }

    const data: unknown = await res.json()

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
