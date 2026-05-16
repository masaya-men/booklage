import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'AllMarks privacy policy — we collect zero personal data. Everything stays in your browser.',
}

export default function PrivacyPage(): React.ReactElement {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: April 14, 2026</p>

      <h2>Our Philosophy: Zero Data Collection</h2>
      <p>
        AllMarks is built on a simple principle: <strong>your data belongs to you</strong>.
        We do not collect, store, or transmit any personal data to our servers.
        All your bookmarks, folders, and collage layouts are stored exclusively
        in your browser&apos;s IndexedDB — a local database that never leaves your device.
      </p>

      <h2>What We Don&apos;t Collect</h2>
      <ul>
        <li>No personal information (name, email, address)</li>
        <li>No account or login credentials (we don&apos;t have accounts)</li>
        <li>No browsing history or bookmark data</li>
        <li>No cookies for tracking or advertising</li>
        <li>No IP addresses or device fingerprints</li>
        <li>No usage analytics tied to individuals</li>
      </ul>

      <h2>Local Storage Only</h2>
      <p>
        All application data is stored in your browser using IndexedDB.
        This means:
      </p>
      <ul>
        <li>Your data exists only on your device</li>
        <li>Clearing your browser data removes all AllMarks data</li>
        <li>We cannot access, recover, or view your data</li>
        <li>No server-side backups of your content exist</li>
      </ul>

      <h2>Sharing Feature</h2>
      <p>
        When you share a collage, AllMarks encodes the collage data into a compressed URL.
        This URL is generated entirely in your browser — no data is sent to our servers.
        The shared URL contains only the information you explicitly choose to share.
      </p>

      <h2>Bookmarklet</h2>
      <p>
        The AllMarks bookmarklet reads OGP meta tags (title, description, image) from the
        page you&apos;re visiting. This information is processed entirely in your browser and
        sent directly to your local AllMarks popup window. No data passes through our servers.
      </p>

      <h2>Hosting &amp; Analytics</h2>
      <p>
        AllMarks is hosted on Cloudflare Pages. Cloudflare may collect minimal,
        anonymized server-level metrics (such as total page views) as part of their
        standard hosting service. These metrics contain no personally identifiable information.
        We do not use Google Analytics, Facebook Pixel, or any third-party tracking scripts.
      </p>

      <h2>Third-Party Services</h2>
      <p>
        AllMarks may display content from third-party websites (such as tweet embeds
        via react-tweet, or video embeds via oEmbed). These embeds may be subject to
        the privacy policies of their respective services. We recommend reviewing
        the privacy policies of any third-party service whose content appears in your collages.
      </p>

      <h2>Future Advertising</h2>
      <p>
        We may introduce advertising (such as Google AdSense or affiliate links)
        in the future to support the free service. If we do, we will update this
        privacy policy accordingly. Any advertising will be clearly labeled,
        and we will continue to collect zero personal data on our end.
      </p>

      <h2>Children&apos;s Privacy</h2>
      <p>
        AllMarks does not knowingly collect any information from children under 13.
        Since we collect no personal data from any user, this is inherently enforced.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this privacy policy from time to time. Changes will be posted
        on this page with an updated &quot;Last updated&quot; date. Since we collect no
        personal data, we cannot notify you directly of changes.
      </p>

      <h2>Contact</h2>
      <p>
        If you have questions about this privacy policy, please visit
        our <a href="/contact">Contact page</a>.
      </p>
    </>
  )
}
