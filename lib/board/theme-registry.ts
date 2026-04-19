import type { ThemeId, ThemeMeta } from './types'

export const THEME_REGISTRY: Record<ThemeId, ThemeMeta> = {
  'dotted-notebook': {
    id: 'dotted-notebook',
    direction: 'vertical',
    backgroundClassName: 'dottedNotebook',
    labelKey: 'board.theme.dottedNotebook',
  },
  'grid-paper': {
    id: 'grid-paper',
    direction: 'vertical',
    backgroundClassName: 'gridPaper',
    labelKey: 'board.theme.gridPaper',
  },
}

export const DEFAULT_THEME_ID: ThemeId = 'dotted-notebook'

export function getThemeMeta(id: ThemeId): ThemeMeta {
  return THEME_REGISTRY[id]
}

export function listThemeIds(): ReadonlyArray<ThemeId> {
  return Object.keys(THEME_REGISTRY) as ThemeId[]
}
