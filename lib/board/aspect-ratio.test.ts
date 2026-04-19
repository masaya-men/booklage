import { describe, it, expect } from 'vitest'
import { estimateAspectRatio, detectAspectRatioSource, type AspectRatioSource } from './aspect-ratio'

describe('estimateAspectRatio', () => {
  it('YouTube returns 16:9', () => {
    expect(estimateAspectRatio({ type: 'youtube' })).toBeCloseTo(16 / 9)
  })
  it('TikTok returns 9:16', () => {
    expect(estimateAspectRatio({ type: 'tiktok' })).toBeCloseTo(9 / 16)
  })
  it('Instagram post returns 1:1', () => {
    expect(estimateAspectRatio({ type: 'instagram-post' })).toBe(1)
  })
  it('Instagram story returns 9:16', () => {
    expect(estimateAspectRatio({ type: 'instagram-story' })).toBeCloseTo(9 / 16)
  })
  it('tweet with image returns 16:9', () => {
    expect(estimateAspectRatio({ type: 'tweet', hasImage: true, textLength: 50 })).toBeCloseTo(16 / 9)
  })
  it('tweet short text returns 1:1', () => {
    expect(estimateAspectRatio({ type: 'tweet', hasImage: false, textLength: 50 })).toBe(1)
  })
  it('tweet long text returns 3:4', () => {
    expect(estimateAspectRatio({ type: 'tweet', hasImage: false, textLength: 200 })).toBe(3 / 4)
  })
  it('Pinterest returns 2:3', () => {
    expect(estimateAspectRatio({ type: 'pinterest' })).toBeCloseTo(2 / 3)
  })
  it('SoundCloud returns 1:1', () => {
    expect(estimateAspectRatio({ type: 'soundcloud' })).toBe(1)
  })
  it('Spotify returns 1:1', () => {
    expect(estimateAspectRatio({ type: 'spotify' })).toBe(1)
  })
  it('image with intrinsic ratio returns that ratio', () => {
    expect(estimateAspectRatio({ type: 'image', intrinsicRatio: 1.5 })).toBe(1.5)
  })
  it('image without intrinsic returns 4:3 fallback', () => {
    expect(estimateAspectRatio({ type: 'image' })).toBeCloseTo(4 / 3)
  })
  it('generic with og-image ratio returns that ratio', () => {
    expect(estimateAspectRatio({ type: 'generic', ogImageRatio: 1.91 })).toBe(1.91)
  })
  it('generic without og-image returns 4:3 fallback', () => {
    expect(estimateAspectRatio({ type: 'generic' })).toBeCloseTo(4 / 3)
  })
})

describe('detectAspectRatioSource', () => {
  it('detects youtube URL', () => {
    const s = detectAspectRatioSource({ url: 'https://www.youtube.com/watch?v=abc', urlType: 'youtube', title: '', description: '' })
    expect(s.type).toBe('youtube')
  })
  it('detects tiktok URL', () => {
    const s = detectAspectRatioSource({ url: 'https://www.tiktok.com/@x/video/1', urlType: 'tiktok', title: '', description: '' })
    expect(s.type).toBe('tiktok')
  })
  it('tweet with short description becomes tweet short', () => {
    const s = detectAspectRatioSource({ url: 'https://x.com/a/status/1', urlType: 'tweet', title: 't', description: 'short' })
    expect(s).toEqual({ type: 'tweet', hasImage: false, textLength: 5 })
  })
  it('tweet with long description becomes tweet long', () => {
    const desc = 'x'.repeat(200)
    const s = detectAspectRatioSource({ url: 'https://x.com/a/status/1', urlType: 'tweet', title: 't', description: desc })
    expect(s).toEqual({ type: 'tweet', hasImage: false, textLength: 200 })
  })
  it('image URL becomes image source', () => {
    const s = detectAspectRatioSource({ url: 'https://cdn/photo.jpg', urlType: 'website', title: '', description: '' })
    expect(s.type).toBe('image')
  })
  it('website falls back to generic', () => {
    const s = detectAspectRatioSource({ url: 'https://news.example.com/post', urlType: 'website', title: 'News', description: 'body' })
    expect(s.type).toBe('generic')
  })
})
