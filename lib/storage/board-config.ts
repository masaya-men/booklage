/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
import type { IDBPDatabase } from 'idb'
import type { BoardConfig } from '@/lib/board/types'
import { DEFAULT_THEME_ID } from '@/lib/board/theme-registry'
import { DEFAULT_PRESET_ID } from '@/lib/board/frame-presets'

const CONFIG_KEY = 'board-config'

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  frameRatio: { kind: 'preset', presetId: DEFAULT_PRESET_ID },
  themeId: DEFAULT_THEME_ID,
  displayMode: 'visual',
  activeFilter: 'all',
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type DbLike = IDBPDatabase<any>

type ConfigRecord = { key: string; config: BoardConfig }

export async function loadBoardConfig(db: DbLike): Promise<BoardConfig> {
  const record = (await db.get('settings', CONFIG_KEY)) as ConfigRecord | undefined
  return { ...DEFAULT_BOARD_CONFIG, ...(record?.config ?? {}) }
}

export async function saveBoardConfig(db: DbLike, config: BoardConfig): Promise<void> {
  const record: ConfigRecord = { key: CONFIG_KEY, config }
  await db.put('settings', record)
}
