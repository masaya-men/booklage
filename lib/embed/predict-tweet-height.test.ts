import { describe, it, expect } from 'vitest'
import { predictTweetAspectRatio } from './predict-tweet-height'
import type { TweetMeta } from './types'

const baseMeta: TweetMeta = {
  id: '1',
  text: '',
  hasPhoto: false,
  hasVideo: false,
  hasPoll: false,
  hasQuotedTweet: false,
  authorName: 'Test',
  authorHandle: 'test',
}

describe('predictTweetAspectRatio', () => {
  const cardWidth = 280

  it('short text returns near-square aspect (~ 1)', () => {
    const meta = { ...baseMeta, text: 'hi' }
    const ratio = predictTweetAspectRatio(meta, cardWidth)
    expect(ratio).toBeGreaterThanOrEqual(0.85)
    expect(ratio).toBeLessThanOrEqual(1.6)
  })

  it('140-char text returns moderately tall card (ratio < 1.2)', () => {
    const meta = { ...baseMeta, text: 'a'.repeat(140) }
    const ratio = predictTweetAspectRatio(meta, cardWidth)
    expect(ratio).toBeLessThan(1.2)
    expect(ratio).toBeGreaterThan(0.4)
  })

  it('280+ char text returns very tall card', () => {
    const meta = { ...baseMeta, text: 'a'.repeat(320) }
    const ratio = predictTweetAspectRatio(meta, cardWidth)
    expect(ratio).toBeLessThan(1.0)
  })

  it('photo adds height (lower aspect than text-only)', () => {
    const textOnly = predictTweetAspectRatio({ ...baseMeta, text: 'hi' }, cardWidth)
    const withPhoto = predictTweetAspectRatio({ ...baseMeta, text: 'hi', hasPhoto: true, photoAspectRatio: 16/9 }, cardWidth)
    expect(withPhoto).toBeLessThan(textOnly)
  })

  it('video adds height similar to photo', () => {
    const withVideo = predictTweetAspectRatio({ ...baseMeta, text: 'hi', hasVideo: true, videoAspectRatio: 16/9 }, cardWidth)
    expect(withVideo).toBeLessThan(1)
  })

  it('quoted tweet adds significant height', () => {
    const noQuote = predictTweetAspectRatio({ ...baseMeta, text: 'hi' }, cardWidth)
    const withQuote = predictTweetAspectRatio({ ...baseMeta, text: 'hi', hasQuotedTweet: true }, cardWidth)
    expect(withQuote).toBeLessThan(noQuote)
  })

  it('poll adds fixed height (~ 120px)', () => {
    const noPoll = predictTweetAspectRatio({ ...baseMeta, text: 'hi' }, cardWidth)
    const withPoll = predictTweetAspectRatio({ ...baseMeta, text: 'hi', hasPoll: true }, cardWidth)
    expect(withPoll).toBeLessThan(noPoll)
  })

  it('returns valid positive ratio for empty text', () => {
    const ratio = predictTweetAspectRatio({ ...baseMeta, text: '' }, cardWidth)
    expect(ratio).toBeGreaterThan(0)
    expect(Number.isFinite(ratio)).toBe(true)
  })
})
