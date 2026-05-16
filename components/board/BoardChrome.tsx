'use client'

import Link from 'next/link'
import styles from './BoardChrome.module.css'

const FOOTER_LINKS = [
  { href: '/guide', label: 'Guide' },
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
] as const

/**
 * Outer-frame chrome for /board.
 * Sits in the white margin around the dark canvas:
 *   - Top-left: AllMarks wordmark linking back to home
 *   - Bottom-center: small link strip to all marketing pages
 * Plain text-only — no glass, no shadow — lets the canvas remain the focal point.
 */
export function BoardChrome(): React.ReactElement {
  return (
    <>
      <Link href="/" className={styles.brand} aria-label="AllMarks home">
        AllMarks
      </Link>
      <nav className={styles.footer} aria-label="Site">
        {FOOTER_LINKS.map((link, i) => (
          <span key={link.href} className={styles.footerItem}>
            <Link href={link.href} className={styles.footerLink}>
              {link.label}
            </Link>
            {i < FOOTER_LINKS.length - 1 && <span className={styles.sep} aria-hidden="true">·</span>}
          </span>
        ))}
      </nav>
    </>
  )
}
