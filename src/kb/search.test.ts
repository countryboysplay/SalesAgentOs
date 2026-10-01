import { describe, expect, it } from 'vitest'
import { buildPack } from './model'
import { buildIndex, highlight, makeSnippet, queryTerms, search, tokenize } from './search'

const pack = buildPack({
  id: 't',
  title: 'Test pack',
  summary: '',
  source: [
    '## Principles',
    'Intro about persuasion.',
    '### Anchoring',
    'Know the reference point before price negotiation starts.',
    '### Objections',
    'An objection is diagnostic information. Pause before answering a price objection.',
    '## Cheat sheet',
    '| Moment | Do |',
    '|---|---|',
    '| Price | Connect economics to value |',
  ].join('\n'),
})
const index = buildIndex([pack])

describe('tokenize / queryTerms', () => {
  it('folds case and accents', () => {
    expect(tokenize('Böckenholt, NEPQ!')).toEqual(['bockenholt', 'nepq'])
  })
  it('drops stop words unless nothing else is left', () => {
    expect(queryTerms('how do I handle the price objection')).toEqual(['handle', 'price', 'objection'])
    expect(queryTerms('what is it')).toEqual(['what', 'is', 'it'])
  })
})

describe('search', () => {
  it('returns nothing for an empty query', () => {
    expect(search(index, '   ')).toEqual([])
  })

  it('attributes a hit to the topic it sits under', () => {
    const [top] = search(index, 'reference point')
    expect(top).toMatchObject({ articleId: 't/principles', topicId: 'anchoring', title: 'Anchoring' })
  })

  it('prefix-matches and requires every word when possible', () => {
    const results = search(index, 'price objections')
    expect(results.map((r) => r.topicId)).toEqual(['objections'])
  })

  it('ranks heading matches first', () => {
    const results = search(index, 'price')
    expect(results.length).toBeGreaterThan(1)
    const [top] = search(index, 'anchoring')
    expect(top?.topicId).toBe('anchoring')
  })

  it('falls back to partial matches when no entry has every word', () => {
    const results = search(index, 'price zebra')
    expect(results.length).toBeGreaterThan(0)
  })

  it('finds table content', () => {
    const [top] = search(index, 'economics')
    expect(top).toMatchObject({ articleId: 't/cheat-sheet', title: 'Cheat sheet' })
  })
})

describe('makeSnippet / highlight', () => {
  it('centres long text on the first hit', () => {
    const text = `${'filler '.repeat(60)}the anchor sits here ${'tail '.repeat(60)}`
    const snippet = makeSnippet(text, ['anchor'])
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
    expect(snippet).toContain('anchor')
  })

  it('marks whole words that start with a query term', () => {
    const runs = highlight('Objections are information', 'objection')
    expect(runs).toEqual([
      { text: 'Objections', match: true },
      { text: ' are information', match: false },
    ])
  })
})
