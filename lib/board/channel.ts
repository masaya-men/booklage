const CHANNEL_NAME = 'booklage'

export type BookmarkSavedMessage = {
  readonly type: 'bookmark-saved'
  readonly bookmarkId: string
}

export function postBookmarkSaved(payload: { bookmarkId: string }): void {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME)
    ch.postMessage({ type: 'bookmark-saved', bookmarkId: payload.bookmarkId } satisfies BookmarkSavedMessage)
    ch.close()
  } catch {
    /* ignore */
  }
}

export function subscribeBookmarkSaved(
  handler: (msg: { bookmarkId: string }) => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const ch = new BroadcastChannel(CHANNEL_NAME)
  const listener = (ev: MessageEvent): void => {
    const data = ev.data as Partial<BookmarkSavedMessage> | null
    if (!data || data.type !== 'bookmark-saved' || !data.bookmarkId) return
    handler({ bookmarkId: data.bookmarkId })
  }
  ch.addEventListener('message', listener)
  return (): void => {
    ch.removeEventListener('message', listener)
    ch.close()
  }
}
