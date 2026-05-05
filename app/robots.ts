import type { MetadataRoute } from 'next'
import { APP_URL } from '@/lib/constants'

export const dynamic = 'force-static'

const PRODUCTION_URL = APP_URL.startsWith('http://localhost')
  ? 'https://booklage.pages.dev'
  : APP_URL

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/save', '/triage', '/seed-demos', '/glass-lab'],
      },
    ],
    sitemap: `${PRODUCTION_URL}/sitemap.xml`,
    host: PRODUCTION_URL,
  }
}
