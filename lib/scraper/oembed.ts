import { z } from 'zod'

export const OembedDataSchema = z.object({
  type: z.enum(['video', 'rich', 'photo', 'link']),
  html: z.string().optional(),
  title: z.string().optional(),
  thumbnail_url: z.string().optional(),
  author_name: z.string().optional(),
  provider_name: z.string().optional(),
})

export type OembedData = z.infer<typeof OembedDataSchema>

/**
 * oEmbed情報をAPIルート経由で取得する（YouTube, TikTok, Instagram対応）
 * @param targetUrl - oEmbed情報を取得したいURL
 * @returns パース済みのoEmbedデータ
 */
export async function fetchOembed(targetUrl: string): Promise<OembedData> {
  const res = await fetch(`/api/oembed?url=${encodeURIComponent(targetUrl)}`)
  if (!res.ok) throw new Error(`oEmbed fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return OembedDataSchema.parse(data)
}
