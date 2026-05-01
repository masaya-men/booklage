import type { MoodRecord } from '@/lib/storage/indexeddb'

export type TagReason = 'domain' | 'keyword' | 'embedding' | 'llm'

export interface TagSuggestion {
  readonly moodId: string
  readonly confidence: number
  readonly reason: TagReason
}

export interface BookmarkTaggerInput {
  readonly url: string
  readonly title: string
  readonly description: string
  readonly siteName: string
}

export interface BookmarkTagger {
  suggest(input: BookmarkTaggerInput): Promise<TagSuggestion[]>
}

export interface BookmarkTaggerContext {
  readonly moods: ReadonlyArray<MoodRecord>
}
