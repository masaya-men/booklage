import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchTweetMeta, parseTweetData } from './tweet-meta'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('parseTweetData', () => {
  it('extracts text and author from valid response', () => {
    const raw = {
      id_str: '1',
      text: 'hello world',
      user: { name: 'Alice', screen_name: 'alice' },
      photos: [],
      mediaDetails: [],
    }
    const meta = parseTweetData(raw)
    expect(meta?.text).toBe('hello world')
    expect(meta?.authorName).toBe('Alice')
    expect(meta?.authorHandle).toBe('alice')
  })

  it('detects hasPhoto when photos array present', () => {
    const raw = {
      id_str: '1',
      text: 'pic',
      user: { name: 'A', screen_name: 'a' },
      photos: [{ url: 'https://pbs.twimg.com/media/X.jpg', width: 1200, height: 675 }],
      mediaDetails: [],
    }
    const meta = parseTweetData(raw)
    expect(meta?.hasPhoto).toBe(true)
    expect(meta?.photoAspectRatio).toBeCloseTo(1200 / 675, 2)
    expect(meta?.photoUrl).toBe('https://pbs.twimg.com/media/X.jpg')
  })

  it('extracts videoPosterUrl from mediaDetails', () => {
    const raw = {
      id_str: '1',
      text: 'video',
      user: { name: 'A', screen_name: 'a' },
      photos: [],
      mediaDetails: [{
        type: 'video',
        media_url_https: 'https://pbs.twimg.com/media/poster.jpg',
        original_info: { width: 1080, height: 1920 },
        video_info: {
          variants: [{ content_type: 'video/mp4', bitrate: 1500000, url: 'https://video.twimg.com/v.mp4' }],
        },
      }],
    }
    const meta = parseTweetData(raw)
    expect(meta?.hasVideo).toBe(true)
    expect(meta?.videoPosterUrl).toBe('https://pbs.twimg.com/media/poster.jpg')
    expect(meta?.videoAspectRatio).toBeCloseTo(1080 / 1920, 3)
  })

  it('extracts highest-bitrate mp4 videoUrl from video_info variants', () => {
    const raw = {
      id_str: '1',
      text: 'video with playable mp4',
      user: { name: 'A', screen_name: 'a' },
      photos: [],
      mediaDetails: [{
        type: 'video',
        media_url_https: 'https://pbs.twimg.com/media/poster.jpg',
        original_info: { width: 1280, height: 720 },
        video_info: {
          variants: [
            { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/x.m3u8' },
            { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/low.mp4' },
            { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/high.mp4' },
          ],
        },
      }],
    }
    const meta = parseTweetData(raw)
    expect(meta?.videoUrl).toBe('https://video.twimg.com/high.mp4')
  })

  it('leaves videoUrl undefined when no mp4 variant exists', () => {
    const raw = {
      id_str: '1',
      text: 'm3u8 only',
      user: { name: 'A', screen_name: 'a' },
      photos: [],
      mediaDetails: [{
        type: 'video',
        media_url_https: 'https://pbs.twimg.com/media/poster.jpg',
        video_info: {
          variants: [
            { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/x.m3u8' },
          ],
        },
      }],
    }
    const meta = parseTweetData(raw)
    expect(meta?.videoUrl).toBeUndefined()
  })

  it('extracts authorAvatar and createdAt when present', () => {
    const raw = {
      id_str: '1',
      text: 'hi',
      created_at: '2026-05-02T22:07:00.000Z',
      user: {
        name: 'A',
        screen_name: 'a',
        profile_image_url_https: 'https://pbs.twimg.com/profile_images/x_normal.jpg',
      },
      photos: [],
      mediaDetails: [],
    }
    const meta = parseTweetData(raw)
    expect(meta?.authorAvatar).toBe('https://pbs.twimg.com/profile_images/x_normal.jpg')
    expect(meta?.createdAt).toBe('2026-05-02T22:07:00.000Z')
  })

  it('returns null for malformed input', () => {
    expect(parseTweetData(null)).toBeNull()
    expect(parseTweetData({})).toBeNull()
  })

  it('extracts mp4 from animated_gif mediaDetails (= X GIF tweets)', () => {
    // X represents GIFs as mediaDetails entries of type "animated_gif" with
    // a single mp4 variant (no audio, intended for autoplay loop). The
    // previous parser dropped these silently, leaving GIF tweets stuck on
    // the text fallback even though a playable mp4 was right there.
    const raw = {
      id_str: '2054511169461727508',
      text: 'I submitted my new template for review.',
      user: { name: 'konrad', screen_name: 'konrad_designs' },
      photos: [],
      mediaDetails: [{
        type: 'animated_gif',
        media_url_https: 'https://pbs.twimg.com/tweet_video_thumb/HIMWtU9WwAADsga.jpg',
        original_info: { width: 640, height: 360 },
        video_info: {
          variants: [
            { content_type: 'video/mp4', bitrate: 0, url: 'https://video.twimg.com/tweet_video/HIMWtU9WwAADsga.mp4' },
          ],
        },
      }],
    }
    const meta = parseTweetData(raw)
    expect(meta?.hasVideo).toBe(true)
    expect(meta?.videoUrl).toBe('https://video.twimg.com/tweet_video/HIMWtU9WwAADsga.mp4')
    expect(meta?.videoAspectRatio).toBeCloseTo(640 / 360, 3)
    expect(meta?.mediaSlots).toHaveLength(1)
    expect(meta?.mediaSlots?.[0]).toEqual({
      type: 'video',
      url: 'https://pbs.twimg.com/tweet_video_thumb/HIMWtU9WwAADsga.jpg',
      videoUrl: 'https://video.twimg.com/tweet_video/HIMWtU9WwAADsga.mp4',
      aspect: 640 / 360,
    })
  })

  it('extracts video from unified_card binding_values (= X promotional / link cards)', () => {
    // unified_card is X's modern format for tweets that show a link card
    // with embedded video (e.g. EnterProAI / lovart_ai promo tweets). The
    // media lives in card.binding_values.unified_card.string_value as a
    // JSON string with a `media_entities` map; mediaDetails itself is
    // empty for these tweets so the prior parser found no video.
    const cardPayload = {
      type: 'video_website',
      media_entities: {
        '13_2046945737510928384': {
          type: 'video',
          media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/2046945737510928384/img/IF_WO3eghGvu3U9S.jpg',
          original_info: { width: 1280, height: 720 },
          video_info: {
            variants: [
              { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/amplify_video/2046945737510928384/pl/x.m3u8' },
              { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/amplify_video/2046945737510928384/vid/low.mp4' },
              { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/amplify_video/2046945737510928384/vid/high.mp4' },
            ],
          },
        },
      },
    }
    const raw = {
      id_str: '2046946956455379344',
      text: 'Introducing Enter Code v1.0.',
      user: { name: 'EnterProAI', screen_name: 'EnterProAI' },
      photos: [],
      mediaDetails: [],
      card: {
        name: 'unified_card',
        binding_values: {
          unified_card: { type: 'STRING', string_value: JSON.stringify(cardPayload) },
          card_url: { type: 'STRING', string_value: 'https://twitter.com' },
        },
      },
    }
    const meta = parseTweetData(raw)
    expect(meta?.hasVideo).toBe(true)
    expect(meta?.videoUrl).toBe('https://video.twimg.com/amplify_video/2046945737510928384/vid/high.mp4')
    expect(meta?.mediaSlots).toHaveLength(1)
    expect(meta?.mediaSlots?.[0].type).toBe('video')
  })

  it('returns empty mediaSlots when unified_card has no media_entities (= text-only card)', () => {
    // Defensive: degrade gracefully when the unified_card payload exists
    // but contains no media (e.g. pure-text link cards). isTweetTextOnly
    // should still see hasPhoto=false / hasVideo=false and route to the
    // LightboxTextDisplay path.
    const raw = {
      id_str: '1',
      text: 'no media card',
      user: { name: 'A', screen_name: 'a' },
      photos: [],
      mediaDetails: [],
      card: {
        name: 'unified_card',
        binding_values: {
          unified_card: { type: 'STRING', string_value: JSON.stringify({ type: 'something' }) },
        },
      },
    }
    const meta = parseTweetData(raw)
    expect(meta?.hasVideo).toBe(false)
    expect(meta?.hasPhoto).toBe(false)
    expect(meta?.mediaSlots).toEqual([])
  })

  it('gracefully handles malformed unified_card JSON (= defensive)', () => {
    const raw = {
      id_str: '1',
      text: 'bad card',
      user: { name: 'A', screen_name: 'a' },
      photos: [],
      mediaDetails: [],
      card: {
        name: 'unified_card',
        binding_values: {
          unified_card: { type: 'STRING', string_value: '{this is not valid json' },
        },
      },
    }
    const meta = parseTweetData(raw)
    expect(meta).not.toBeNull()
    expect(meta?.mediaSlots).toEqual([])
  })

  it('does NOT consult unified_card when mediaDetails already populated', () => {
    // Mix-content tweets occasionally carry both mediaDetails (the real
    // attached media) and a unified_card (the link preview). mediaDetails
    // is the canonical source, so the card walk must be skipped to avoid
    // double-counting the link-card poster as a second slot.
    const cardPayload = {
      media_entities: {
        '1': { type: 'video', media_url_https: 'https://card/poster.jpg', video_info: { variants: [{ content_type: 'video/mp4', bitrate: 1, url: 'https://card/v.mp4' }] } },
      },
    }
    const raw = {
      id_str: '1',
      text: 'both',
      user: { name: 'A', screen_name: 'a' },
      photos: [],
      mediaDetails: [{
        type: 'photo',
        media_url_https: 'https://media/real.jpg',
      }],
      card: {
        name: 'unified_card',
        binding_values: { unified_card: { type: 'STRING', string_value: JSON.stringify(cardPayload) } },
      },
    }
    const meta = parseTweetData(raw)
    expect(meta?.mediaSlots).toHaveLength(1)
    expect(meta?.mediaSlots?.[0]).toEqual({ type: 'photo', url: 'https://media/real.jpg' })
  })
})

describe('fetchTweetMeta', () => {
  it('returns null when tweet is deleted (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const result = await fetchTweetMeta('999')
    expect(result).toBeNull()
  })
})
