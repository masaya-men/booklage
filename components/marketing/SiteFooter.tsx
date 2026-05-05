import Link from 'next/link'
import styles from './SiteFooter.module.css'

type FooterColumn = {
  heading: string
  links: ReadonlyArray<{ href: string; label: string }>
}

const COLUMNS: ReadonlyArray<FooterColumn> = [
  {
    heading: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/guide', label: 'Guide' },
      { href: '/board', label: 'Open Board' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/faq', label: 'FAQ' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
]

export function SiteFooter(): React.ReactElement {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandColumn}>
          <Link href="/" className={styles.brand} aria-label="Booklage home">
            Booklage
          </Link>
          <p className={styles.tagline}>
            ブックマークを、ビジュアルコラージュに。
          </p>
        </div>
        <div className={styles.columns}>
          {COLUMNS.map((col) => (
            <div key={col.heading} className={styles.column}>
              <h3 className={styles.heading}>{col.heading}</h3>
              <ul className={styles.list}>
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={styles.link}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bottom}>
        <p>&copy; 2026 Booklage</p>
        <p className={styles.bottomMeta}>
          Data lives in your browser. No accounts, no tracking.
        </p>
      </div>
    </footer>
  )
}
