import { z } from 'zod'

export const OgpDataSchema = z.object({
  title: z.string(),
  description: z.string(),
  image: z.string(),
  siteName: z.string(),
  favicon: z.string(),
  url: z.string(),
})

export type OgpData = z.infer<typeof OgpDataSchema>

/**
 * OGP情報をAPIルート経由で取得する
 * @param targetUrl - OGP情報を取得したいURL
 * @returns パース済みのOGPデータ
 */
export async function fetchOgp(targetUrl: string): Promise<OgpData> {
  const res = await fetch(`/api/ogp?url=${encodeURIComponent(targetUrl)}`)
  if (!res.ok) throw new Error(`OGP fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return OgpDataSchema.parse(data)
}
