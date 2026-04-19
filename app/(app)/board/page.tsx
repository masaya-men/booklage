import type { Metadata } from 'next'
import { BoardRoot } from '@/components/board/BoardRoot'

export const metadata: Metadata = {
  title: 'Board',
}

export default function BoardPage(): React.ReactElement {
  return <BoardRoot />
}
