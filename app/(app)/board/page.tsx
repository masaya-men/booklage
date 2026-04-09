import type { Metadata } from 'next'
import { BoardClient } from './board-client'

export const metadata: Metadata = {
  title: 'Board',
}

export default function BoardPage(): React.ReactElement {
  return <BoardClient />
}
