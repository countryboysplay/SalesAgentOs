import { describe, expect, it } from 'vitest'
import { getLibrary } from './library'
import { search } from './search'

describe('shipped library', () => {
  const lib = getLibrary()

  it('builds every pack into non-empty articles', () => {
    expect(lib.packs.length).toBeGreaterThan(0)
    for (const pack of lib.packs) {
      expect(pack.articles.length).toBeGreaterThan(0)
      for (const article of pack.articles) expect(article.blocks.length).toBeGreaterThan(0)
    }
  })

  it('carries no leftover citation markers', () => {
    for (const entry of lib.index.entries) {
      expect(entry.text).not.toMatch(/\bcite\b|turn\d+search|[\ue200-\ue2ff]/)
    }
  })

  it('cuts the psychology pack as configured', () => {
    const pack = lib.packs.find((p) => p.id === 'sales-psychology')!
    expect(pack.featured?.title).toBe('Modern Inside-Sales Psychology Cheat Sheet')
    const coaching = pack.articles.filter((a) => a.audience === 'coaching').map((a) => a.slug)
    expect(coaching).toEqual([
      'training-and-implementation-system',
      'evidence-hierarchy-for-managers',
      'recommended-primary-and-practitioner-sources',
    ])
    const principles = lib.articles.get(
      'sales-psychology/psychological-principles-mapped-to-inside-sales-behavior',
    )!
    expect(principles.topics.map((t) => t.title)).toContain('Choice architecture')
  })

  it('lists only stages that have content, in call order', () => {
    const ids = lib.stages.map((s) => s.id)
    expect(ids).toEqual(['opener', 'discovery', 'pitch', 'objections', 'close'])
    for (const stage of lib.stages) {
      for (const ref of stage.refs) expect(lib.articles.has(ref.articleId)).toBe(true)
    }
  })

  it('answers real questions', () => {
    expect(search(lib.index, 'price objection').length).toBeGreaterThan(0)
    expect(search(lib.index, 'scarcity')[0]?.title).toBe('Scarcity')
    expect(search(lib.index, 'Jeremy Miner')[0]?.title).toBe('Jeremy Miner')
  })
})
