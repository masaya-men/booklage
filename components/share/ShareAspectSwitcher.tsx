// components/share/ShareAspectSwitcher.tsx
'use client'

import type { ReactElement } from 'react'
import type { ShareAspect } from '@/lib/share/types'
import styles from './ShareAspectSwitcher.module.css'

type Props = {
  readonly value: ShareAspect
  readonly onChange: (next: ShareAspect) => void
}

type PresetTile = {
  readonly id: ShareAspect
  /** Visible label. Empty string for icon-only tiles. */
  readonly label: string
  /** Hover tooltip + screen-reader name (use case, e.g. "Instagram"). */
  readonly tooltip: string
  readonly icon: ReactElement
}

// Mini-rect icons drawn at the actual aspect ratio so the proportion is
// readable at a glance (1:1 square, 16:9 wide, 9:16 tall). All inscribed
// in a 32x32 viewBox so visual weight stays balanced across tiles.
const ICON_STROKE = 1.6
const ICON_RADIUS = 2

function SquareIcon(): ReactElement {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <rect x="9" y="9" width="14" height="14" rx={ICON_RADIUS} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} />
    </svg>
  )
}

function WideIcon(): ReactElement {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <rect x="4" y="11" width="24" height="13.5" rx={ICON_RADIUS} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} />
    </svg>
  )
}

function TallIcon(): ReactElement {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <rect x="9.25" y="4" width="13.5" height="24" rx={ICON_RADIUS} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} />
    </svg>
  )
}

// Free mode: stacked / scattered rectangles to evoke "collage on an
// infinite board". 3 overlapping rects of varied size and rotation.
function BoardIcon(): ReactElement {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <rect x="6" y="6" width="11" height="9" rx={ICON_RADIUS} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} />
      <rect x="15" y="11" width="13" height="10" rx={ICON_RADIUS} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} />
      <rect x="9" y="18" width="10" height="9" rx={ICON_RADIUS} fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} />
    </svg>
  )
}

const FREE_TILE: PresetTile = {
  id: 'free',
  label: 'ボード全体',
  tooltip: 'ボード全体',
  icon: <BoardIcon />,
}

// SNS preset tiles: icon-only. The label is the use case (Instagram /
// YouTube / Stories) so tooltip + aria-label communicate intent without
// adding visual weight to the header.
const PRESET_TILES: ReadonlyArray<PresetTile> = [
  { id: '1:1',  label: '', tooltip: 'Instagram (1:1)', icon: <SquareIcon /> },
  { id: '16:9', label: '', tooltip: 'YouTube (16:9)',  icon: <WideIcon /> },
  { id: '9:16', label: '', tooltip: 'Stories (9:16)',  icon: <TallIcon /> },
]

type TileButtonProps = {
  readonly tile: PresetTile
  readonly active: boolean
  readonly onClick: () => void
}

function TileButton({ tile, active, onClick }: TileButtonProps): ReactElement {
  const isIconOnly = tile.label === ''
  const className = [
    styles.tile,
    isIconOnly ? styles.tileIconOnly : '',
    active ? styles.tileActive : '',
  ].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={tile.tooltip}
      title={tile.tooltip}
      className={className}
      onClick={onClick}
      data-aspect={tile.id}
    >
      <span className={styles.tileIcon}>{tile.icon}</span>
      {tile.label && <span className={styles.tileLabel}>{tile.label}</span>}
    </button>
  )
}

export function ShareAspectSwitcher({ value, onChange }: Props): ReactElement {
  return (
    <div className={styles.row} role="radiogroup" aria-label="Aspect ratio">
      <TileButton
        tile={FREE_TILE}
        active={value === 'free'}
        onClick={(): void => onChange('free')}
      />
      <span className={styles.divider} aria-hidden="true" />
      {PRESET_TILES.map((t) => (
        <TileButton
          key={t.id}
          tile={t}
          active={value === t.id}
          onClick={(): void => onChange(t.id)}
        />
      ))}
    </div>
  )
}
