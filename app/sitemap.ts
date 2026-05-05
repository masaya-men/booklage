import type { MetadataRoute } from 'next'
import { APP_URL } from '@/lib/constants'

export const dynamic = 'force-static'

const PRODUCTION_URL = APP_URL.startsWith('http://localhost')
  ? 'https://booklage.pages.dev'
  : APP_URL

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  const routes: Array<{ path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' }> = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/board', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/features', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/guide', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/faq', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/contact', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/privacy', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/terms', priority: 0.5, changeFrequency: 'monthly' },
  ]

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${PRODUCTION_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }))
}
