import messages from '@/messages/ja.json'

export function t(key: string): string {
  const parts = key.split('.')
  let cur: unknown = messages
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return key
    cur = (cur as Record<string, unknown>)[p]
  }
  return typeof cur === 'string' ? cur : key
}
