'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  initDB,
  addBookmark,
} from '@/lib/storage/indexeddb'
import { detectUrlType } from '@/lib/utils/url'

/** Sample URL curated for B-embeds visual verification. Real, public,
 * long-lived content — picked so the user can see TikTok, YouTube Shorts,
 * and Instagram cards working end-to-end without needing the bookmarklet. */
type Demo = {
  readonly url: string
  readonly title: string
  readonly kind: string
}

const DEMOS: readonly Demo[] = [
  {
    url: 'https://www.youtube.com/shorts/dBmvepSzdmw',
    title: '',
    kind: 'YouTube Shorts',
  },
  {
    url: 'https://www.youtube.com/shorts/SXHMnicI6Pg',
    title: '',
    kind: 'YouTube Shorts',
  },
  {
    url: 'https://www.tiktok.com/@khaby.lame/video/7137423965982858501',
    title: '',
    kind: 'TikTok',
  },
  {
    url: 'https://www.tiktok.com/@zachking/video/7105493986757512491',
    title: '',
    kind: 'TikTok',
  },
  {
    url: 'https://www.instagram.com/p/CxOqjGSr-d8/',
    title: '',
    kind: 'Instagram post',
  },
  {
    url: 'https://www.instagram.com/reel/CwB_dH6rcGv/',
    title: '',
    kind: 'Instagram reel',
  },
] as const

type RowState = 'pending' | 'saving' | 'done' | 'error'

type Row = {
  readonly demo: Demo
  state: RowState
  error?: string
}

export function SeedDemos(): React.ReactElement {
  const [rows, setRows] = useState<Row[]>(
    DEMOS.map((demo) => ({ demo, state: 'pending' })),
  )
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const started = useRef(false)

  const run = useCallback(async (): Promise<void> => {
    if (started.current) return
    started.current = true
    setRunning(true)

    try {
      const db = await initDB()

      for (let i = 0; i < DEMOS.length; i++) {
        const demo = DEMOS[i]
        setRows((prev) =>
          prev.map((r, idx) => (idx === i ? { ...r, state: 'saving' } : r)),
        )
        try {
          await addBookmark(db, {
            url: demo.url,
            title: demo.title,
            description: '',
            thumbnail: '',
            favicon: '',
            siteName: '',
            type: detectUrlType(demo.url),
            tags: [],
          })
          setRows((prev) =>
            prev.map((r, idx) => (idx === i ? { ...r, state: 'done' } : r)),
          )
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'unknown error'
          setRows((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, state: 'error', error: msg } : r,
            ),
          )
        }
      }
    } finally {
      setRunning(false)
      setDone(true)
    }
  }, [])

  useEffect(() => {
    // Auto-run on mount unless explicitly opted-out via ?manual=1
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('manual') === '1') return
    void run()
  }, [run])

  return (
    <main
      style={{
        maxWidth: 640,
        margin: '60px auto',
        padding: '32px',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#1a1a1a',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        B-embeds 視覚確認用サンプル投入
      </h1>
      <p style={{ fontSize: 14, color: '#555', marginBottom: 24 }}>
        TikTok / YouTube Shorts / Instagram の実 URL を IDB に追加します。
        既存のブクマは消しません。完了後、<a href="/board">/board</a> で確認してください。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              background:
                r.state === 'done'
                  ? '#e6f7ea'
                  : r.state === 'error'
                    ? '#fdecea'
                    : '#fafafa',
              border: '1px solid rgba(0,0,0,0.06)',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <span style={{ width: 120, color: '#666' }}>{r.demo.kind}</span>
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: '#333',
              }}
            >
              {r.demo.url}
            </span>
            <span style={{ width: 70, textAlign: 'right', fontWeight: 600 }}>
              {r.state === 'pending' && '待機中'}
              {r.state === 'saving' && '保存中...'}
              {r.state === 'done' && '✓ 追加'}
              {r.state === 'error' && '✗ 失敗'}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
        {!running && !done && (
          <button
            type="button"
            onClick={() => void run()}
            style={{
              padding: '10px 20px',
              background: '#1a1a1a',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            投入開始
          </button>
        )}
        {done && (
          <a
            href="/board"
            style={{
              padding: '10px 20px',
              background: '#1a1a1a',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Board で確認 →
          </a>
        )}
      </div>
    </main>
  )
}
