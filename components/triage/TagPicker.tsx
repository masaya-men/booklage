'use client'
import type { ReactElement } from 'react'
import type { MoodRecord } from '@/lib/storage/indexeddb'

type Props = {
  readonly moods: ReadonlyArray<MoodRecord>
  readonly onTag: (moodId: string) => void
  readonly onSkip: () => void
  readonly onUndo: (() => void) | null
  readonly onCreateMood: (name: string) => void
}

export function TagPicker(_props: Props): ReactElement {
  return <div data-testid="tag-picker-stub" />
}
