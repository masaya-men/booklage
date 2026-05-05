'use client'

import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'
import styles from './SiteHeader.module.css'

const NAV_ITEMS = [
  { href: '/features', label: 'Features' },
  { href: '/guide', label: 'Guide' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
] as const

type SiteHeaderProps = {
  showThemeToggle?: boolean
}

export function SiteHeader({ showThemeToggle = true }: SiteHeaderProps = {}): React.ReactElement {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo} aria-label="Booklage home">
        Booklage
      </Link>
      <nav className={styles.nav} aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={styles.navLink}>
            {item.label}
          </Link>
        ))}
        <Link href="/board" className={styles.openApp}>
          Open Board
        </Link>
        {showThemeToggle && (
          <span className={styles.themeToggleSlot}>
            <ThemeToggle />
          </span>
        )}
      </nav>
    </header>
  )
}
