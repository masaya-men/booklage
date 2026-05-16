// app/(app)/share/page.tsx
import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { SharedView } from '@/components/share/SharedView'

export const metadata: Metadata = {
  title: 'Shared Collage — AllMarks',
  description: 'A shared moodboard from AllMarks.',
}

// Static-export friendly: SharedView is a client component reading
// `window.location.hash` directly. Hash is never sent to the server.
export const dynamic = 'force-static'

export default function SharePage(): ReactElement {
  return <SharedView />
}
