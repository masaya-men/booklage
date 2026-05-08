'use client'

import { useCallback, useMemo, useState, type CSSProperties, type ReactElement } from 'react'
import { PipStack, type PipStackCard } from '@/components/pip/PipStack'
import styles from './page.module.css'

interface TuneState {
  readonly cardW: number
  readonly cardH: number
  readonly gap: number
  readonly neighborOpacity: number
  readonly meterW: number
  readonly meterBottom: number
  readonly transitionMs: number
}

const DEFAULTS: TuneState = {
  cardW: 178,
  cardH: 100,
  gap: 16,
  neighborOpacity: 0.4,
  meterW: 210,
  meterBottom: 14,
  transitionMs: 280,
}

/** Per-site native aspect ratios (width / height). PiP cards preserve these
 *  so a vertical reel reads as 9:16 and a horizontal video reads as 16:9. */
const SAMPLES: ReadonlyArray<PipStackCard> = [
  {
    id: 'sample-yt',
    title: 'YouTube — King Krule live',
    thumbnail: 'https://i.ytimg.com/vi/LvkuwIDPtLc/maxresdefault.jpg',
    favicon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=64',
    aspectRatio: 16 / 9,
  },
  {
    id: 'sample-1042',
    title: '1042 Studio — Infinite Gallery',
    thumbnail: 'https://framerusercontent.com/images/0NsAJMapYwBHxss8sHjBQMcs8.jpg?width=3840&height=2160',
    favicon: 'https://www.google.com/s2/favicons?domain=1042.studio&sz=64',
    aspectRatio: 16 / 9,
  },
  {
    id: 'sample-tt',
    title: 'TikTok — Billie Jean edit',
    thumbnail: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-p-0037/ogkNiagNBEASIAepAmA1I1EwfYCDZCBUiDjV8F~tplv-tiktokx-origin.image?dr=14575&x-expires=1778396400&x-signature=ItQob%2BYUj0Pxuj0BOr%2F%2FjLGIh5A%3D&t=4d5b0474&ps=13740610&shp=81f88b70&shcp=43f4a2f9&idc=my3',
    favicon: 'https://www.google.com/s2/favicons?domain=tiktok.com&sz=64',
    aspectRatio: 9 / 16,
  },
  {
    id: 'sample-ig',
    title: 'Instagram Reel',
    thumbnail: 'https://scontent-nrt1-1.cdninstagram.com/v/t51.82787-15/682092147_18587938687042964_2581148170372127074_n.jpg?stp=dst-jpg_e35_p1080x1080_sh2.08_tt6&_nc_ht=scontent-nrt1-1.cdninstagram.com&_nc_cat=108&_nc_oc=Q6cZ2gFvaQmbmoIfu9JUNiLXZVn2Mka32wRPXraHjEVJlq2zDGysoZ-lveHIHAQfMmGYYAf1k8yTgNhrPsmK7qEeG1HQ&_nc_ohc=jlzNzcMSa7cQ7kNvwH3OmrP&_nc_gid=Tks5P2QjA7EuQgBHVPv56Q&edm=APs17CUBAAAA&ccb=7-5&oh=00_Af4fvjao65aJijaFSdba1bUXPr6aDXJ5svJ1MZMsJb1NPg&oe=6A034185&_nc_sid=10d13b',
    favicon: 'https://www.google.com/s2/favicons?domain=instagram.com&sz=64',
    aspectRatio: 9 / 16,
  },
  {
    id: 'sample-kawai',
    title: 'kawai-text-animation (text site, no thumb)',
    thumbnail: '',
    favicon: 'https://www.google.com/s2/favicons?domain=kawai-text-animation.pages.dev&sz=64',
    aspectRatio: 1,
  },
]

interface SliderProps {
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly suffix?: string
  readonly onChange: (next: number) => void
}

function Slider({ label, value, min, max, step, suffix, onChange }: SliderProps): ReactElement {
  const display = step < 1 ? value.toFixed(2) : value.toString()
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className={styles.fieldValue}>{display}{suffix ?? ''}</span>
    </label>
  )
}

export default function PipTunePage(): ReactElement {
  const [state, setState] = useState<TuneState>(DEFAULTS)
  const [count, setCount] = useState<number>(5)

  const update = useCallback(<K extends keyof TuneState>(key: K, value: TuneState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }))
  }, [])

  const reset = useCallback(() => setState(DEFAULTS), [])

  /** Cycle through SAMPLES and clone with unique IDs once we run past the
   *  base list — lets the user push card count well past 5 to see how the
   *  carousel and the wave meter behave with many entries. */
  const visibleCards = useMemo<ReadonlyArray<PipStackCard>>(() => {
    const out: PipStackCard[] = []
    for (let i = 0; i < count; i++) {
      const base = SAMPLES[i % SAMPLES.length]!
      out.push({ ...base, id: i < SAMPLES.length ? base.id : `${base.id}-${i}` })
    }
    return out
  }, [count])

  const stackStyle: CSSProperties = useMemo(() => {
    const css: Record<string, string> = {
      '--pip-card-w': `${state.cardW}px`,
      '--pip-card-h': `${state.cardH}px`,
      '--pip-gap': `${state.gap}px`,
      '--pip-neighbor-opacity': `${state.neighborOpacity}`,
      '--pip-meter-w': `${state.meterW}px`,
      '--pip-meter-bottom': `${state.meterBottom}px`,
      '--pip-transition-ms': `${state.transitionMs}ms`,
    }
    return css as CSSProperties
  }, [state])

  const cssText = useMemo(() => {
    return [
      `--pip-card-w: ${state.cardW}px;`,
      `--pip-card-h: ${state.cardH}px;`,
      `--pip-gap: ${state.gap}px;`,
      `--pip-neighbor-opacity: ${state.neighborOpacity.toFixed(2)};`,
      `--pip-meter-w: ${state.meterW}px;`,
      `--pip-meter-bottom: ${state.meterBottom}px;`,
      `--pip-transition-ms: ${state.transitionMs}ms;`,
    ].join('\n')
  }, [state])

  const copyValues = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(cssText)
    } catch {
      // ignore — fall back to manual copy from the readout
    }
  }, [cssText])

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>PiP Layout Tuner</h1>
          <p className={styles.subtitle}>256 × 256 inner stage — adjust until it feels right, then bake into PipStack.module.css.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.button} onClick={reset}>Reset</button>
          <button type="button" className={`${styles.button} ${styles.buttonAccent}`} onClick={copyValues}>Copy CSS</button>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.previewColumn}>
          <div className={styles.previewBox}>
            <p className={styles.previewLabel}>Preview · 256 × 256</p>
            <div className={styles.stage}>
              {visibleCards.length === 0 ? (
                <div style={{ position: 'absolute', inset: 0, background: '#000' }} />
              ) : (
                <PipStack cards={visibleCards} onCardClick={() => {}} stageStyle={stackStyle} />
              )}
            </div>
            <p className={styles.previewMeta}>
              {count} cards · index 0 = newest (centred). Drag the wave meter
              under the stage to scrub like the Lightbox.
            </p>
            <div className={styles.previewControls}>
              <button type="button" className={styles.button} onClick={() => setCount(Math.max(0, count - 1))}>− card</button>
              <button type="button" className={styles.button} onClick={() => setCount(count + 1)}>+ card</button>
              <button type="button" className={styles.button} onClick={() => setCount(count + 10)}>+ 10</button>
              <button type="button" className={styles.button} onClick={() => setCount(5)}>Reset count</button>
            </div>
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Carousel</h2>
            <Slider label="Frame width" value={state.cardW} min={80} max={240} step={1} suffix="px" onChange={(v) => update('cardW', v)} />
            <Slider label="Frame height" value={state.cardH} min={60} max={200} step={1} suffix="px" onChange={(v) => update('cardH', v)} />
            <Slider label="Gap" value={state.gap} min={0} max={48} step={1} suffix="px" onChange={(v) => update('gap', v)} />
            <Slider label="Peek opacity" value={state.neighborOpacity} min={0.05} max={1} step={0.01} onChange={(v) => update('neighborOpacity', v)} />
            <Slider label="Transition" value={state.transitionMs} min={80} max={800} step={10} suffix="ms" onChange={(v) => update('transitionMs', v)} />
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Meter</h2>
            <Slider label="Width" value={state.meterW} min={120} max={240} step={1} suffix="px" onChange={(v) => update('meterW', v)} />
            <Slider label="Bottom" value={state.meterBottom} min={0} max={32} step={1} suffix="px" onChange={(v) => update('meterBottom', v)} />
          </div>

          <div className={styles.readout}>
            <div className={styles.readoutHeader}>
              <h3 className={styles.readoutTitle}>Current values</h3>
            </div>
            {cssText}
          </div>
        </div>
      </div>
    </div>
  )
}
