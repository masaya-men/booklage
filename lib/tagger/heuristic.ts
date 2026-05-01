import type { BookmarkTagger, BookmarkTaggerContext, BookmarkTaggerInput, TagSuggestion } from './types'

const DOMAIN_TO_KEYWORD: Record<string, string[]> = {
  'github.com': ['code', 'dev', 'programming'],
  'gitlab.com': ['code', 'dev'],
  'stackoverflow.com': ['code', 'dev'],
  'youtube.com': ['video', 'music'],
  'youtu.be': ['video', 'music'],
  'vimeo.com': ['video', 'film'],
  'tiktok.com': ['video'],
  'twitter.com': ['social'],
  'x.com': ['social'],
  'instagram.com': ['photo', 'photography', 'social'],
  'medium.com': ['article', 'writing'],
  'substack.com': ['article', 'writing'],
  'figma.com': ['design'],
  'dribbble.com': ['design'],
  'behance.net': ['design'],
  'pinterest.com': ['design', 'photo'],
  'unsplash.com': ['photo', 'photography'],
  'flickr.com': ['photo', 'photography'],
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export class HeuristicTagger implements BookmarkTagger {
  constructor(private ctx: BookmarkTaggerContext) {}

  async suggest(input: BookmarkTaggerInput): Promise<TagSuggestion[]> {
    const suggestions: TagSuggestion[] = []
    const host = hostname(input.url)
    const haystack = (input.title + ' ' + input.description + ' ' + input.siteName).toLowerCase()
    const haystackWords = haystack.split(/\W+/).filter((w) => w.length >= 3)

    const domainKeywords = DOMAIN_TO_KEYWORD[host] ?? []
    const moods = this.ctx.moods

    for (const mood of moods) {
      const moodName = mood.name.toLowerCase()
      // Domain match: high confidence
      if (domainKeywords.some((kw) => kw === moodName || moodName.includes(kw) || kw.includes(moodName))) {
        suggestions.push({ moodId: mood.id, confidence: 0.8, reason: 'domain' })
        continue
      }
      // Keyword match in title/description/siteName (symmetric: word substring of mood or mood substring of haystack)
      if (moodName.length >= 3 && (haystack.includes(moodName) || haystackWords.some((w) => moodName.includes(w)))) {
        suggestions.push({ moodId: mood.id, confidence: 0.5, reason: 'keyword' })
      }
    }

    // De-duplicate by moodId, keep highest confidence
    const byId = new Map<string, TagSuggestion>()
    for (const s of suggestions) {
      const prev = byId.get(s.moodId)
      if (!prev || prev.confidence < s.confidence) byId.set(s.moodId, s)
    }
    return Array.from(byId.values()).sort((a, b) => b.confidence - a.confidence)
  }
}
