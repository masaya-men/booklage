import { Suspense } from 'react'
import { SaveIframeClient } from './SaveIframeClient'

export default function SaveIframePage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <SaveIframeClient />
    </Suspense>
  )
}
