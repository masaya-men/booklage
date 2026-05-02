'use client'
import type { ReactElement } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'

export function TriageCard({ item }: { item: BoardItem }): ReactElement {
  return <div data-testid="triage-card">{item.title}</div>
}
