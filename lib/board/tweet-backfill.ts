import type { TweetMeta, MediaSlot } from '@/lib/embed/types'

/** A single bookmark's identity for the backfill. */
export type TweetBackfillTarget = {
  readonly bookmarkId: string
  readonly tweetId: string
}

/** Side-effecting hooks the backfill calls when meta resolves. Passed in
 *  (rather than imported) so unit tests can inject mocks and so production
 *  callers can wire to React state through useBoardData. */
export type TweetBackfillHooks = {
  readonly fetchMeta: (tweetId: string) => Promise<TweetMeta | null>
  readonly persistThumbnail: (bookmarkId: string, url: string, force: boolean) => Promise<void>
  readonly persistVideoFlag: (bookmarkId: string, hasVideo: boolean) => Promise<void>
  readonly persistMediaSlots: (bookmarkId: string, slots: readonly MediaSlot[]) => Promise<void>
}

/** Fetch tweet meta once and write through to all three persisted fields.
 *  Returns silently on any failure or cancellation. Designed to be passed
 *  to a BackfillQueue as a task. */
export async function backfillTweetMeta(
  target: TweetBackfillTarget,
  signal: AbortSignal,
  hooks: TweetBackfillHooks,
): Promise<void> {
  let meta: TweetMeta | null
  try {
    meta = await hooks.fetchMeta(target.tweetId)
  } catch {
    return
  }
  if (!meta || signal.aborted) return

  // Thumbnail — write through always; the bookmarklet captures X's generic
  // placeholder for every tweet, so the syndication response is the only
  // source of truth here (force=true).
  // Video tweets: videoPosterUrl is the better thumbnail (still frame from
  // the video itself). Photo-only: fall back to photoUrl. Text-only: ''.
  const thumbUrl = meta.videoPosterUrl ?? meta.photoUrl ?? ''
  try {
    await hooks.persistThumbnail(target.bookmarkId, thumbUrl, true)
  } catch {
    /* per-field failure: keep going so the other fields still persist. */
  }
  if (signal.aborted) return

  // hasVideo flag — only flip to true. Never set back to false (cardinal
  // rule: backfill never removes user-visible state).
  if (meta.hasVideo) {
    try {
      await hooks.persistVideoFlag(target.bookmarkId, true)
    } catch {
      /* swallow */
    }
  }
  if (signal.aborted) return

  // mediaSlots — only when the fetched meta actually has slot data. Empty
  // array means text-only tweet, in which case we don't want to overwrite
  // anything (= no-op).
  if (meta.mediaSlots && meta.mediaSlots.length > 0) {
    try {
      await hooks.persistMediaSlots(target.bookmarkId, meta.mediaSlots)
    } catch {
      /* swallow */
    }
  }
}
