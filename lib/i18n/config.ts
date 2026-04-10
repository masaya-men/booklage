export const SUPPORTED_LOCALES = ['ja', 'en'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = 'ja'

/** Detect browser language and return closest supported locale */
export function detectLocale(): SupportedLocale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  const browserLang = navigator.language.split('-')[0]
  if (SUPPORTED_LOCALES.includes(browserLang as SupportedLocale)) {
    return browserLang as SupportedLocale
  }
  return DEFAULT_LOCALE
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
