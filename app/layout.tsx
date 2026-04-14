import type { Metadata, Viewport } from 'next'
import { Inter, Outfit, Caveat } from 'next/font/google'
import { APP_NAME, APP_URL } from '@/lib/constants'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
})

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-handwriting',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Bookmark × Collage`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    'Turn your bookmarks into beautiful visual collages. Save any URL, arrange freely, share as images.',
  metadataBase: new URL(APP_URL),
  openGraph: {
    title: `${APP_NAME} — Bookmark × Collage`,
    description: 'Turn your bookmarks into beautiful visual collages.',
    siteName: APP_NAME,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} — Bookmark × Collage`,
    description: 'Turn your bookmarks into beautiful visual collages.',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
}

type RootLayoutProps = {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps): React.ReactElement {
  return (
    <html lang="ja" data-theme="dark" data-card-style="glass" data-ui-theme="auto">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
          }
        `}} />
      </head>
      <body className={`${inter.variable} ${outfit.variable} ${caveat.variable}`}>
        {children}
      </body>
    </html>
  )
}
