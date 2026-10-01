import { describe, expect, it } from 'vitest'
import { blockText, inlineText, parseInline, parseMarkdown, slugify } from './markdown'

describe('parseInline', () => {
  it('parses bold, italic, code and links', () => {
    const nodes = parseInline('Use **matched proof**, *not* `logos` — see [Gong](https://gong.io).')
    expect(nodes.map((n) => n.kind)).toEqual(['text', 'strong', 'text', 'em', 'text', 'code', 'text', 'link', 'text'])
    expect(inlineText(nodes)).toBe('Use matched proof, not logos — see Gong.')
  })

  it('leaves unmatched markers and raw HTML as text', () => {
    expect(inlineText(parseInline('2 * 3 = 6 and **open'))).toBe('2 * 3 = 6 and **open')
    expect(parseInline('<script>x</script>')).toEqual([{ kind: 'text', text: '<script>x</script>' }])
  })
})

describe('parseMarkdown', () => {
  it('parses headings with unique ids', () => {
    const blocks = parseMarkdown('## Objections\n\n### Objections\n\ntext')
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 2, id: 'objections' })
    expect(blocks[1]).toMatchObject({ kind: 'heading', level: 3, id: 'objections-2' })
  })

  it('joins wrapped paragraph lines', () => {
    const [p] = parseMarkdown('first line\nsecond line\n\nnext')
    expect(blockText(p!)).toBe('first line second line')
  })

  it('parses bullet and numbered lists', () => {
    const blocks = parseMarkdown('- one\n- two\n\n3. three\n4. four')
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: false })
    expect(blocks[1]).toMatchObject({ kind: 'list', ordered: true, start: 3 })
    expect(blockText(blocks[1]!)).toBe('three four')
  })

  it('parses tables and right-aligned columns', () => {
    const [table] = parseMarkdown('| Rank | Tactic |\n|---:|---|\n| 1 | **Listen** |\n| 2 |')
    expect(table).toMatchObject({ kind: 'table', numeric: [true, false] })
    if (table?.kind !== 'table') throw new Error('expected table')
    expect(table.rows).toHaveLength(2)
    expect(table.rows[1]).toHaveLength(2) // short rows are padded
    expect(inlineText(table.rows[0]![1]!)).toBe('Listen')
  })

  it('parses quotes and fenced code', () => {
    const blocks = parseMarkdown('> A buyer who discovers\n> a conclusion\n\n```\nraw *text*\n```')
    expect(blocks[0]).toMatchObject({ kind: 'quote' })
    expect(blockText(blocks[0]!)).toBe('A buyer who discovers a conclusion')
    expect(blocks[1]).toEqual({ kind: 'code', text: 'raw *text*' })
  })
})

describe('slugify', () => {
  it('makes stable url-safe ids', () => {
    expect(slugify('Psychological principles mapped to inside-sales behavior')).toBe(
      'psychological-principles-mapped-to-inside-sales-behavior',
    )
    expect(slugify('Böckenholt & Goodman')).toBe('bockenholt-goodman')
  })
})
