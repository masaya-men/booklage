import type { BoardItem } from '@/lib/storage/use-board-data'
import type { BoardFilter } from './types'

export function applyFilter(items: ReadonlyArray<BoardItem>, filter: BoardFilter): BoardItem[] {
  if (filter === 'all') {
    return items.filter((it) => !it.isDeleted)
  }
  if (filter === 'inbox') {
    return items.filter((it) => !it.isDeleted && it.tags.length === 0)
  }
  if (filter === 'archive') {
    return items.filter((it) => it.isDeleted)
  }
  if (filter === 'dead') {
    return items.filter((it) => !it.isDeleted && it.linkStatus === 'gone')
  }
  // template literal: `mood:${id}`
  const moodId = filter.slice(5)
  return items.filter((it) => !it.isDeleted && it.tags.includes(moodId))
}
