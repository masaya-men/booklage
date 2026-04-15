export const SUPPORTED_LOCALES = [
  'ja', 'en', 'zh', 'ko',
  'es', 'fr', 'de', 'pt', 'it',
  'nl', 'tr', 'ru', 'ar', 'th', 'vi',
] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = 'ja'

/** Detect browser language and return closest supported locale.
 *  Checks navigator.languages array for best match, falls back to English. */
export function detectLocale(): SupportedLocale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE

  const candidates = navigator.languages ?? [navigator.language]
  for (const lang of candidates) {
    const primary = lang.split('-')[0].toLowerCase()
    if (SUPPORTED_LOCALES.includes(primary as SupportedLocale)) {
      return primary as SupportedLocale
    }
  }
  // Default to English for non-Japanese international users
  return 'en'
}

type Messages = Record<string, Record<string, string>>

const messageCache = new Map<string, Messages>()

/** Load translation messages for a given locale (cached) */
export async function loadMessages(locale: SupportedLocale): Promise<Messages> {
  if (messageCache.has(locale)) return messageCache.get(locale)!
  const messages = (await import(`@/messages/${locale}.json`)).default as Messages
  messageCache.set(locale, messages)
  return messages
}
