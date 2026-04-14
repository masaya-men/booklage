const THEME_COLOR_MODES: Record<string, 'dark' | 'light'> = {
  dark: 'dark',
  space: 'dark',
  ocean: 'dark',
  forest: 'dark',
  grid: 'dark',
  cork: 'light',
  'minimal-white': 'light',
  cardboard: 'light',
  'custom-image': 'dark',
}

export function getColorModeForTheme(theme: string, customColor?: string): 'dark' | 'light' {
  if (theme === 'custom-color' && customColor) {
    return getColorModeForColor(customColor)
  }
  return THEME_COLOR_MODES[theme] ?? 'dark'
}

export function getColorModeForColor(hexColor: string): 'dark' | 'light' {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255

  const linearR = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)
  const linearG = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)
  const linearB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)

  const luminance = 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB

  return luminance >= 0.5 ? 'light' : 'dark'
}

export function resolveUiTheme(
  uiTheme: 'auto' | 'dark' | 'light',
  dataTheme: 'dark' | 'light',
): 'dark' | 'light' {
  return uiTheme === 'auto' ? dataTheme : uiTheme
}
