import type { ReactNode } from 'react'

/**
 * Route-segment layout for the bookmarklet save popup.
 *
 * Next.js App Router does not allow nested layouts to redeclare <html>/<body>,
 * so we inject a <style> tag that overrides the global background to pure black.
 * The browser parses this inline <style> while building the DOM and applies it
 * before first paint commit, eliminating the white flash that the popup window
 * shows when opened against the global #0a0a0a canvas (#000 reads as a clean
 * "stage" instead of the slightly-lit app theme).
 */
export default function SaveLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `html, body { background: #000 !important; margin: 0; padding: 0; overflow: hidden; min-height: 0 !important; }`,
        }}
      />
      {children}
    </>
  )
}
