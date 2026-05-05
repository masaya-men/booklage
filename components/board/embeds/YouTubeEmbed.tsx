'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react'
import { loadYouTubeIframeApi, YT_STATE, type YTPlayer } from '@/lib/youtube/iframe-api'
import lightboxStyles from '../Lightbox.module.css'
import styles from './YouTubeEmbed.module.css'

type Props = {
  readonly videoId: string
  readonly title: string
  readonly vertical: boolean
  readonly thumbnail: string | undefined
}

/** YouTube embed driven by the IFrame Player API. We run the player with
 *  `controls=0` (no native chrome) and render our own hover-only controls
 *  on top, because cross-origin iframes can't have their internal controls
 *  hidden via CSS, and YouTube's native auto-fade is both delayed (~3s)
 *  and absent in the paused state — meaning a paused player would
 *  permanently show the giant ▶ overlay + related-video tiles, which
 *  breaks the "leave to see only the video" expectation. */
export function YouTubeEmbed({ videoId, title, vertical, thumbnail }: Props): ReactElement {
  const [hasInteracted, setHasInteracted] = useState<boolean>(false)
  const [player, setPlayer] = useState<YTPlayer | null>(null)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [hovered, setHovered] = useState<boolean>(false)
  const [scrubbing, setScrubbing] = useState<boolean>(false)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [duration, setDuration] = useState<number>(0)
  const [muted, setMuted] = useState<boolean>(false)
  const [volume, setVolume] = useState<number>(100)
  const [fullscreen, setFullscreen] = useState<boolean>(false)
  const [volumeOpen, setVolumeOpen] = useState<boolean>(false)

  const wrapRef = useRef<HTMLDivElement>(null)
  const mountContainerRef = useRef<HTMLDivElement>(null)

  const poster = useMemo(
    (): string => thumbnail ?? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    [thumbnail, videoId]
  )

  // Manual DOM-mount pattern: React owns mountContainer, we create/destroy
  // the actual host element ourselves so StrictMode's double-invoke leaves
  // a clean slate after each cleanup. YT.Player.destroy() removes the
  // iframe but does NOT restore its host element, so reusing the same React-
  // rendered <div> across mounts breaks on the second go-round.
  useEffect((): (() => void) | void => {
    if (!hasInteracted || !mountContainerRef.current) return
    const container = mountContainerRef.current
    const mount = document.createElement('div')
    mount.style.width = '100%'
    mount.style.height = '100%'
    container.appendChild(mount)

    let cancelled = false
    let createdPlayer: YTPlayer | null = null

    loadYouTubeIframeApi()
      .then((YT): void => {
        if (cancelled) {
          mount.remove()
          return
        }
        createdPlayer = new YT.Player(mount, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            iv_load_policy: 3,
            playsinline: 1,
            fs: 0,
          },
          events: {
            onReady: (event): void => {
              if (cancelled) return
              try {
                event.target.setPlaybackQuality('hd1080')
                setDuration(event.target.getDuration())
                setVolume(event.target.getVolume())
                setMuted(event.target.isMuted())
              } catch {
                /* IFrame API may not be fully ready; values default OK */
              }
              setPlayer(event.target)
            },
            onStateChange: (event): void => {
              if (cancelled) return
              if (event.data === YT_STATE.PLAYING) setIsPlaying(true)
              if (event.data === YT_STATE.PAUSED || event.data === YT_STATE.ENDED) {
                setIsPlaying(false)
              }
              try {
                const d = event.target.getDuration()
                if (d > 0) setDuration(d)
              } catch {
                /* same reason as onReady — guarded */
              }
            },
          },
        })
      })
      .catch((): void => {
        mount.remove()
      })

    return (): void => {
      cancelled = true
      try {
        createdPlayer?.destroy()
      } catch {
        /* destroy is best-effort */
      }
      if (mount.parentNode) mount.parentNode.removeChild(mount)
    }
  }, [hasInteracted, videoId])

  // Poll currentTime on rAF only while playing and not scrubbing — scrubbing
  // owns the displayed time so it doesn't jitter back to the player's clock
  // mid-drag, which would feel like the thumb fighting the user's pointer.
  useEffect((): (() => void) | void => {
    if (!player || !isPlaying || scrubbing) return
    let raf = 0
    const tick = (): void => {
      try {
        setCurrentTime(player.getCurrentTime())
      } catch {
        /* player may have been destroyed mid-tick */
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return (): void => cancelAnimationFrame(raf)
  }, [player, isPlaying, scrubbing])

  // Track fullscreen changes initiated outside our toggle (e.g. ESC key,
  // or browser-native fullscreen exit) so the icon stays in sync.
  useEffect((): () => void => {
    const handler = (): void => {
      setFullscreen(document.fullscreenElement === wrapRef.current)
    }
    document.addEventListener('fullscreenchange', handler)
    return (): void => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const togglePlay = useCallback((): void => {
    if (!player) return
    try {
      if (player.getPlayerState() === YT_STATE.PLAYING) player.pauseVideo()
      else player.playVideo()
    } catch {
      /* ignored */
    }
  }, [player])

  const toggleMute = useCallback((): void => {
    if (!player) return
    try {
      if (player.isMuted()) {
        player.unMute()
        setMuted(false)
      } else {
        player.mute()
        setMuted(true)
      }
    } catch {
      /* ignored */
    }
  }, [player])

  const handleVolumeChange = useCallback((value: number): void => {
    if (!player) return
    try {
      player.setVolume(value)
      setVolume(value)
      if (value > 0 && player.isMuted()) {
        player.unMute()
        setMuted(false)
      } else if (value === 0 && !player.isMuted()) {
        player.mute()
        setMuted(true)
      }
    } catch {
      /* ignored */
    }
  }, [player])

  const handleSeek = useCallback((seconds: number): void => {
    if (!player) return
    try {
      player.seekTo(seconds, true)
      setCurrentTime(seconds)
    } catch {
      /* ignored */
    }
  }, [player])

  const toggleFullscreen = useCallback((): void => {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
    } else {
      void el.requestFullscreen?.()
    }
  }, [])

  const showControls = hovered || scrubbing
  const wrapperClass = vertical ? lightboxStyles.iframeWrap9x16 : lightboxStyles.iframeWrap16x9
  const showMutedIcon = muted || volume === 0

  return (
    <div
      ref={wrapRef}
      className={wrapperClass}
      onPointerEnter={(): void => setHovered(true)}
      onPointerLeave={(): void => {
        setHovered(false)
        setVolumeOpen(false)
      }}
    >
      {hasInteracted ? (
        <>
          <div ref={mountContainerRef} className={styles.playerMount} />
          <div className={styles.chrome} data-visible={showControls}>
            <div className={styles.chromeTop}>
              <h2 className={styles.titleText}>{title}</h2>
            </div>

            <button
              type="button"
              className={styles.clickZone}
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            />

            <div className={styles.chromeBottom}>
              <ProgressBar
                current={scrubbing ? currentTime : currentTime}
                duration={duration}
                onSeek={handleSeek}
                onScrubStart={(): void => setScrubbing(true)}
                onScrubEnd={(): void => setScrubbing(false)}
              />
              <div className={styles.controlsRow}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>

                <div
                  className={styles.volumeGroup}
                  onPointerEnter={(): void => setVolumeOpen(true)}
                  onPointerLeave={(): void => setVolumeOpen(false)}
                >
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={toggleMute}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                  >
                    {showMutedIcon ? <MutedIcon /> : <VolumeIcon />}
                  </button>
                  <div className={styles.volumeSliderWrap} data-open={volumeOpen}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={muted ? 0 : volume}
                      onChange={(event): void => handleVolumeChange(Number(event.target.value))}
                      aria-label="Volume"
                      className={styles.volumeSlider}
                    />
                  </div>
                </div>

                <span className={styles.timeText}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <span className={styles.spacer} />

                <a
                  href={`https://www.youtube.com/watch?v=${videoId}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={styles.youtubeLogo}
                  aria-label="Open in YouTube"
                  title="Open in YouTube"
                >
                  <YouTubeIcon />
                </a>

                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={toggleFullscreen}
                  aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <img src={poster} alt={title} className={lightboxStyles.embedPoster} />
          <button
            type="button"
            className={lightboxStyles.playOverlay}
            onClick={(): void => setHasInteracted(true)}
            aria-label="Play"
          >
            <span className={lightboxStyles.playDisc} aria-hidden="true">
              <svg viewBox="0 0 24 24" className={lightboxStyles.playOverlayIcon} aria-hidden="true">
                <path d="M6.5 5v14l11-7z" />
              </svg>
            </span>
          </button>
        </>
      )}
    </div>
  )
}

function ProgressBar({
  current,
  duration,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: {
  readonly current: number
  readonly duration: number
  readonly onSeek: (seconds: number) => void
  readonly onScrubStart: () => void
  readonly onScrubEnd: () => void
}): ReactElement {
  const trackRef = useRef<HTMLDivElement>(null)

  const pct = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0

  const fractionFromPointer = (event: ReactPointerEvent<HTMLDivElement>): number => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return 0
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
    return x / rect.width
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    onScrubStart()
    onSeek(fractionFromPointer(event) * duration)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    onSeek(fractionFromPointer(event) * duration)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
      onScrubEnd()
    }
  }

  return (
    <div
      ref={trackRef}
      className={styles.progressTrack}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={Math.max(1, Math.floor(duration))}
      aria-valuenow={Math.floor(current)}
      aria-label="Seek"
      tabIndex={0}
    >
      <div className={styles.progressFill} style={{ width: `${pct * 100}%` }} />
      <div className={styles.progressThumb} style={{ left: `${pct * 100}%` }} />
    </div>
  )
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const remaining = String(total % 60).padStart(2, '0')
  return `${minutes}:${remaining}`
}

function PlayIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 5v14l11-7z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5h4v14H6zm8 0h4v14h-4z" fill="currentColor" />
    </svg>
  )
}

function VolumeIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"
      />
    </svg>
  )
}

function MutedIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.94 8.94 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18z"
      />
    </svg>
  )
}

function FullscreenIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
      />
    </svg>
  )
}

function FullscreenExitIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
      />
    </svg>
  )
}

function YouTubeIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#FF0000"
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"
      />
      <path fill="#fff" d="M9.545 15.568V8.432L15.818 12z" />
    </svg>
  )
}
