/** YouTube IFrame Player API — singleton loader.
 *
 *  The IFrame API exposes JS hooks (play/pause/seek/quality/state events)
 *  for an embedded YouTube player. We use it solely so we can run the
 *  player with `controls=0` (no native chrome) and render our own hover-
 *  only controls on top — necessary because cross-origin iframes can't
 *  have their internal controls hidden via CSS, and the native auto-fade
 *  on mouseleave is both delayed (~3s) and absent in the paused state.
 *
 *  The API is loaded lazily on first call and shared across all players
 *  in the page. `window.onYouTubeIframeAPIReady` is the callback the
 *  loaded script invokes — we wrap it in a Promise so React effects can
 *  await it without the global-callback dance leaking into call sites.
 *
 *  Cost: zero. The IFrame API is public and free; it does not require
 *  an API key and is unrelated to YouTube Data API v3 quota. */

export type YTPlayer = {
  destroy: () => void
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  getVolume: () => number
  setVolume: (volume: number) => void
  mute: () => void
  unMute: () => void
  isMuted: () => boolean
  setPlaybackQuality: (quality: string) => void
  getPlayerState: () => number
}

export type YTPlayerEvent = {
  target: YTPlayer
  data: number
}

type YTPlayerVars = {
  autoplay?: 0 | 1
  controls?: 0 | 1
  modestbranding?: 0 | 1
  rel?: 0 | 1
  iv_load_policy?: 1 | 3
  playsinline?: 0 | 1
  fs?: 0 | 1
  cc_load_policy?: 0 | 1
  enablejsapi?: 0 | 1
  origin?: string
}

export type YTPlayerOptions = {
  videoId: string
  host?: string
  width?: string | number
  height?: string | number
  playerVars?: YTPlayerVars
  events?: {
    onReady?: (event: YTPlayerEvent) => void
    onStateChange?: (event: YTPlayerEvent) => void
    onError?: (event: YTPlayerEvent) => void
  }
}

type YTPlayerConstructor = new (
  element: HTMLElement | string,
  options: YTPlayerOptions
) => YTPlayer

export type YTGlobal = {
  Player: YTPlayerConstructor
  PlayerState: {
    UNSTARTED: -1
    ENDED: 0
    PLAYING: 1
    PAUSED: 2
    BUFFERING: 3
    CUED: 5
  }
}

declare global {
  interface Window {
    YT?: YTGlobal
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YTGlobal> | null = null

export function loadYouTubeIframeApi(): Promise<YTGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube IFrame API requires a browser'))
  }
  if (apiPromise) return apiPromise
  if (window.YT?.Player) {
    apiPromise = Promise.resolve(window.YT)
    return apiPromise
  }
  apiPromise = new Promise<YTGlobal>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = (): void => {
      previous?.()
      if (window.YT) resolve(window.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.async = true
    document.head.appendChild(tag)
  })
  return apiPromise
}

export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const
