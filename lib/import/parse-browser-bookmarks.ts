import type { ImportedBookmark, ParseResult } from './types'

/**
 * Parse Netscape Bookmark Format HTML (exported from Chrome/Firefox/Safari).
 * Traverses DL/DT structure to extract URLs with folder hierarchy.
 */
export function parseBrowserBookmarks(html: string): ParseResult {
  const bookmarks: ImportedBookmark[] = []
  const errors: string[] = []
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const topDl = doc.querySelector('dl')
    if (!topDl) return { bookmarks, errors }

    function traverse(dl: Element, currentFolder?: string): void {
      const children = dl.children
      for (let i = 0; i < children.length; i++) {
        const dt = children[i]
        if (dt.tagName !== 'DT') continue
        const heading = dt.querySelector(':scope > h3')
        if (heading) {
          const folderName = heading.textContent?.trim() ?? ''
          const subDl = dt.querySelector(':scope > dl')
          if (subDl) traverse(subDl, folderName)
          continue
        }
        const anchor = dt.querySelector(':scope > a')
        if (anchor) {
          const url = anchor.getAttribute('href')
          if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) continue
          const addDate = anchor.getAttribute('add_date')
          let addedAt: string | undefined
          if (addDate) {
            const ts = parseInt(addDate, 10)
            if (!isNaN(ts)) addedAt = new Date(ts * 1000).toISOString()
          }
          bookmarks.push({
            url,
            title: anchor.textContent?.trim() ?? url,
            folder: currentFolder,
            addedAt,
            source: 'browser',
          })
        }
      }
    }
    traverse(topDl)
  } catch (e) {
    errors.push(`Failed to parse browser bookmarks: ${e instanceof Error ? e.message : String(e)}`)
  }
  return { bookmarks, errors }
}
