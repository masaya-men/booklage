import { Suspense } from 'react'
import { SavePopup } from '@/components/bookmarklet/SavePopup'

/**
 * Bookmarklet save popup page.
 * Opened in a small popup window by the bookmarklet.
 * Receives OGP data via URL search params.
 */
export default function SavePage(): React.ReactElement {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: 'center' }}>読み込み中...</div>}>
      <SavePopup />
    </Suspense>
  )
}
