import Link from 'next/link'
import { ThemeToggle } from '@/components/marketing/ThemeToggle'

/**
 * Shared layout for marketing/static pages (Privacy, Terms, FAQ, About, Contact).
 * Provides consistent header with back-to-home link and centered content column.
 * Defaults to light theme (overrides root layout's dark default).
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="static-page">
      <header className="static-header">
        <Link href="/" className="static-logo">Booklage</Link>
        <nav className="static-nav">
          <Link href="/about">About</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
          <ThemeToggle />
        </nav>
      </header>
      <main className="static-main">
        {children}
      </main>
      <footer className="static-footer">
        <p>&copy; 2026 Booklage. All rights reserved.</p>
        <nav>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/contact">Contact</Link>
        </nav>
      </footer>
    </div>
  )
}
