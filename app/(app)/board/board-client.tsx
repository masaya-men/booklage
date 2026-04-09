'use client'

import { Canvas } from '@/components/board/Canvas'

/**
 * Main board orchestrator — manages bookmarks, cards, and URL input.
 * This is a placeholder; full implementation follows in a subsequent commit.
 */
export function BoardClient(): React.ReactElement {
  return (
    <Canvas bgTheme="dark">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--color-text-tertiary)',
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-xl)',
        }}
      >
        URLを入力してブックマークを追加しよう
      </div>
    </Canvas>
  )
}
