// tests/lib/import/parse-browser-bookmarks.test.ts
import { describe, it, expect } from 'vitest'
import { parseBrowserBookmarks } from '@/lib/import/parse-browser-bookmarks'

const SIMPLE_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000">Work</H3>
    <DL><p>
        <DT><A HREF="https://github.com" ADD_DATE="1700000001">GitHub</A>
        <DT><A HREF="https://figma.com" ADD_DATE="1700000002">Figma</A>
    </DL><p>
    <DT><H3 ADD_DATE="1700000000">Personal</H3>
    <DL><p>
        <DT><A HREF="https://youtube.com" ADD_DATE="1700000003">YouTube</A>
    </DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1700000004">No Folder</A>
</DL><p>`

describe('parseBrowserBookmarks', () => {
  it('parses bookmarks with folder structure', () => {
    const result = parseBrowserBookmarks(SIMPLE_HTML)
    expect(result.errors).toHaveLength(0)
    expect(result.bookmarks).toHaveLength(4)
    expect(result.bookmarks[0]).toMatchObject({
      url: 'https://github.com', title: 'GitHub', folder: 'Work', source: 'browser',
    })
    expect(result.bookmarks[2]).toMatchObject({
      url: 'https://youtube.com', title: 'YouTube', folder: 'Personal', source: 'browser',
    })
  })
  it('handles bookmarks without a folder', () => {
    const result = parseBrowserBookmarks(SIMPLE_HTML)
    const noFolder = result.bookmarks.find((b) => b.url === 'https://example.com')
    expect(noFolder?.folder).toBeUndefined()
  })
  it('converts ADD_DATE unix timestamp to ISO', () => {
    const result = parseBrowserBookmarks(SIMPLE_HTML)
    expect(result.bookmarks[0].addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
  it('returns empty array for invalid HTML', () => {
    const result = parseBrowserBookmarks('<html><body>Not bookmarks</body></html>')
    expect(result.bookmarks).toHaveLength(0)
  })
  it('handles nested folders (uses deepest folder name)', () => {
    const nested = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Parent</H3>
  <DL><p>
    <DT><H3>Child</H3>
    <DL><p>
      <DT><A HREF="https://deep.com">Deep</A>
    </DL><p>
  </DL><p>
</DL><p>`
    const result = parseBrowserBookmarks(nested)
    expect(result.bookmarks[0].folder).toBe('Child')
  })
})
