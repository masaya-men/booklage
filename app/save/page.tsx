import { Suspense } from 'react'
import { SaveToast } from '@/components/bookmarklet/SaveToast'

export default function SavePage(): React.ReactElement {
  return (
    <Suspense fallback={<div style={{ padding: 16, textAlign: 'center' }}>…</div>}>
      <SaveToast />
    </Suspense>
  )
}
