import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Extension Privacy Policy — AllMarks',
  description: 'Privacy policy for the AllMarks Chrome extension.',
}

export default function ExtensionPrivacyPage(): React.ReactElement {
  return (
    <>
      <h1>AllMarks Chrome Extension — Privacy Policy</h1>
      <p className="updated">Last updated: 2026-05-09</p>

      <h2>What this extension does</h2>
      <p>
        AllMarks saves URLs you choose to a local visual collage in your browser.
        When you click the extension&apos;s icon, press <code>Ctrl+Shift+B</code>, or use the right-click
        &quot;Save to AllMarks&quot; menu, the extension reads the URL, page title, OGP description,
        OGP image URL, site name, and favicon URL of the active tab (or the link you right-clicked)
        and writes them as a bookmark to your browser&apos;s IndexedDB inside the booklage.pages.dev origin.
      </p>

      <h2>What we do NOT collect</h2>
      <ul>
        <li>We do not collect, log, or transmit your browsing history.</li>
        <li>We do not send any data to our servers or any third party.</li>
        <li>We have no analytics, tracking, advertising, or telemetry of any kind in this extension.</li>
        <li>We do not read page contents beyond the OGP/Open Graph meta tags listed above.</li>
      </ul>

      <h2>Where data is stored</h2>
      <ul>
        <li>
          All saved bookmarks live only in your browser&apos;s IndexedDB under the origin
          {' '}<code>https://booklage.pages.dev</code>.
        </li>
        <li>
          Extension settings (auto-open PiP, cursor pill position) are saved via{' '}
          <code>chrome.storage.sync</code>. If you have Chrome sync enabled, these settings will
          sync across your Chrome browsers via Google&apos;s infrastructure (we never see them).
          If sync is disabled, they live locally only.
        </li>
        <li>
          We do not maintain any account, server, or database that stores your bookmarks.
        </li>
      </ul>

      <h2>Data exposed to other origins</h2>
      <p>
        The extension creates a hidden iframe pointing at{' '}
        <code>https://booklage.pages.dev/save-iframe?ext=1</code> to bridge from the
        extension&apos;s origin into the booklage.pages.dev origin. This is necessary so the
        bookmark can be written to the same IndexedDB that the booklage.pages.dev web app reads.
        No information is sent to any other domain.
      </p>

      <h2>Permissions and why we need them</h2>
      <table className="static-table">
        <thead>
          <tr>
            <th>Permission</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>activeTab</code></td>
            <td>Read the URL + OGP meta of the tab you actively trigger save on.</td>
          </tr>
          <tr>
            <td><code>contextMenus</code></td>
            <td>Add the right-click &quot;Save to AllMarks&quot; entries.</td>
          </tr>
          <tr>
            <td><code>scripting</code></td>
            <td>Inject the OGP extractor into the active tab to read meta tags.</td>
          </tr>
          <tr>
            <td><code>offscreen</code></td>
            <td>Create the offscreen document that hosts the booklage.pages.dev iframe bridge.</td>
          </tr>
          <tr>
            <td><code>storage</code></td>
            <td>Persist your extension settings via <code>chrome.storage.sync</code>.</td>
          </tr>
          <tr>
            <td><code>notifications</code></td>
            <td>Show a system notification fallback when the in-page cursor pill cannot be drawn (e.g. on chrome:// pages).</td>
          </tr>
          <tr>
            <td><code>host_permissions: https://booklage.pages.dev/*</code></td>
            <td>Allow the offscreen bridge to load the booklage save endpoint.</td>
          </tr>
        </tbody>
      </table>

      <h2>Open source</h2>
      <p>
        Source code is available at{' '}
        <a href="https://github.com/masaya-men/booklage" target="_blank" rel="noopener noreferrer">
          github.com/masaya-men/booklage
        </a>
        {' '}(extension under <code>extension/</code>).
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions, please use the <Link href="/contact">contact form</Link>.
      </p>

      <h2>Changes</h2>
      <p>
        We will update this page when permissions or data flows change. The &quot;Last updated&quot;
        stamp at the top reflects the most recent change.
      </p>
    </>
  )
}
