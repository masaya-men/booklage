import type { Metadata } from 'next'
import { TriagePage } from '@/components/triage/TriagePage'

export const metadata: Metadata = { title: 'Triage' }

export default function Page(): React.ReactElement {
  return <TriagePage />
}
