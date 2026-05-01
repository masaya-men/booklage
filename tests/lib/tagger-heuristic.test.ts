import { describe, it, expect } from 'vitest'
import { HeuristicTagger } from '@/lib/tagger/heuristic'

const moods = [
  { id: 'm-code', name: 'code', color: '#aaa', order: 0, createdAt: 0 },
  { id: 'm-photo', name: 'photography', color: '#bbb', order: 1, createdAt: 0 },
  { id: 'm-design', name: 'design', color: '#ccc', order: 2, createdAt: 0 },
]

describe('HeuristicTagger', () => {
  it('suggests code mood for github.com URL', async () => {
    const t = new HeuristicTagger({ moods })
    const suggestions = await t.suggest({
      url: 'https://github.com/user/repo', title: 'repo', description: '', siteName: 'GitHub',
    })
    expect(suggestions.map((s) => s.moodId)).toContain('m-code')
    expect(suggestions[0].reason).toBe('domain')
  })

  it('suggests photography mood when title contains "photo"', async () => {
    const t = new HeuristicTagger({ moods })
    const suggestions = await t.suggest({
      url: 'https://example.com/x', title: 'My photo diary', description: '', siteName: '',
    })
    expect(suggestions.map((s) => s.moodId)).toContain('m-photo')
  })

  it('returns empty when nothing matches', async () => {
    const t = new HeuristicTagger({ moods })
    const suggestions = await t.suggest({
      url: 'https://randomsite.test/x', title: 'x', description: '', siteName: '',
    })
    expect(suggestions).toEqual([])
  })

  it('confidence is between 0 and 1', async () => {
    const t = new HeuristicTagger({ moods })
    const suggestions = await t.suggest({
      url: 'https://github.com/x', title: 'x', description: '', siteName: '',
    })
    for (const s of suggestions) {
      expect(s.confidence).toBeGreaterThan(0)
      expect(s.confidence).toBeLessThanOrEqual(1)
    }
  })
})
