/**
 * markdown — the small Markdown subset the knowledge packs are written in.
 *
 * Not a general Markdown engine. It covers exactly what training material
 * needs and nothing that would need sanitising: headings (## to ####),
 * paragraphs, bullet and numbered lists, pipe tables, block quotes, fenced
 * code and horizontal rules; inline **bold**, *italic*, `code` and
 * [links](url). Raw HTML is never interpreted — it renders as text.
 *
 * Pure and synchronous so it runs in tests and at module load.
 */

/* ------------------------------------------------------------------- types */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] }

export type Block =
  | { kind: 'heading'; level: 2 | 3 | 4; text: string; id: string }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][]; numeric: boolean[] }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' }

/* ------------------------------------------------------------------ inline */

/** Parses inline emphasis, code and links. Unmatched markers stay as text. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = []
  let text = ''
  const flush = () => {
    if (text) out.push({ kind: 'text', text })
    text = ''
  }

  let i = 0
  while (i < source.length) {
    const rest = source.slice(i)

    if (rest.startsWith('**')) {
      const end = source.indexOf('**', i + 2)
      if (end > i + 2) {
        flush()
        out.push({ kind: 'strong', children: parseInline(source.slice(i + 2, end)) })
        i = end + 2
        continue
      }
    }

    if (rest[0] === '*' && rest[1] !== '*' && rest[1] !== ' ') {
      const end = source.indexOf('*', i + 1)
      if (end > i + 1 && source[end - 1] !== ' ') {
        flush()
        out.push({ kind: 'em', children: parseInline(source.slice(i + 1, end)) })
        i = end + 1
        continue
      }
    }

    if (rest[0] === '`') {
      const end = source.indexOf('`', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ kind: 'code', text: source.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    if (rest[0] === '[') {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)
      if (link) {
        flush()
        out.push({ kind: 'link', href: link[2]!, children: parseInline(link[1]!) })
        i += link[0].length
        continue
      }
    }

    text += source[i]
    i += 1
  }

  flush()
  return out
}

/** The visible text of a run of inlines — for search and accessible names. */
export function inlineText(inlines: Inline[]): string {
  return inlines
    .map((node) =>
      node.kind === 'text' || node.kind === 'code' ? node.text : inlineText(node.children),
    )
    .join('')
}

/* ------------------------------------------------------------------- slugs */

/** 'Trust and credibility' -> 'trust-and-credibility'. Stable across edits to body text. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/* ------------------------------------------------------------------ blocks */

const HEADING = /^(#{2,4})\s+(.+?)\s*#*\s*$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/

function splitRow(line: string): string[] {
  let row = line.trim()
  if (row.startsWith('|')) row = row.slice(1)
  if (row.endsWith('|')) row = row.slice(0, -1)
  return row.split('|').map((cell) => cell.trim())
}

/** Parses a document into blocks. Heading ids are unique within the document. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  const usedIds = new Map<string, number>()

  const uniqueId = (text: string) => {
    const base = slugify(text) || 'section'
    const seen = usedIds.get(base) ?? 0
    usedIds.set(base, seen + 1)
    return seen === 0 ? base : `${base}-${seen + 1}`
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]!

    if (line.trim() === '') {
      i += 1
      continue
    }

    // Fenced code
    if (line.trim().startsWith('```')) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) body.push(lines[i++]!)
      i += 1
      blocks.push({ kind: 'code', text: body.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const text = heading[2]!
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length as 2 | 3 | 4,
        text,
        id: uniqueId(text),
      })
      i += 1
      continue
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' })
      i += 1
      continue
    }

    // Table: a pipe row immediately followed by a |---| rule
    if (line.includes('|') && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]!)) {
      const header = splitRow(line)
      const numeric = splitRow(lines[i + 1]!).map((cell) => /-:$/.test(cell))
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
        const cells = splitRow(lines[i]!)
        while (cells.length < header.length) cells.push('')
        rows.push(cells.slice(0, header.length).map(parseInline))
        i += 1
      }
      blocks.push({ kind: 'table', header: header.map(parseInline), rows, numeric })
      continue
    }

    if (line.trimStart().startsWith('>')) {
      const body: string[] = []
      while (i < lines.length && lines[i]!.trimStart().startsWith('>')) {
        body.push(lines[i]!.trimStart().replace(/^>\s?/, ''))
        i += 1
      }
      blocks.push({ kind: 'quote', blocks: parseMarkdown(body.join('\n')) })
      continue
    }

    const bullet = BULLET.exec(line)
    const ordered = ORDERED.exec(line)
    if (bullet || ordered) {
      const isOrdered = !bullet
      const pattern = isOrdered ? ORDERED : BULLET
      const items: Inline[][] = []
      while (i < lines.length) {
        const match = pattern.exec(lines[i]!)
        if (!match) break
        let item = (isOrdered ? match[2] : match[1])!
        i += 1
        // Lazy continuation lines belong to the item.
        while (
          i < lines.length &&
          lines[i]!.trim() !== '' &&
          !BULLET.test(lines[i]!) &&
          !ORDERED.test(lines[i]!) &&
          !HEADING.test(lines[i]!)
        ) {
          item += ` ${lines[i]!.trim()}`
          i += 1
        }
        items.push(parseInline(item))
      }
      blocks.push({
        kind: 'list',
        ordered: isOrdered,
        start: ordered ? Number(ordered[1]) : 1,
        items,
      })
      continue
    }

    // Paragraph: runs until a blank line or the start of another block.
    const body: string[] = [line.trim()]
    i += 1
    while (i < lines.length) {
      const next = lines[i]!
      if (
        next.trim() === '' ||
        HEADING.test(next) ||
        BULLET.test(next) ||
        ORDERED.test(next) ||
        next.trim().startsWith('```') ||
        next.trimStart().startsWith('>') ||
        (next.includes('|') && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]!))
      ) {
        break
      }
      body.push(next.trim())
      i += 1
    }
    blocks.push({ kind: 'paragraph', inlines: parseInline(body.join(' ')) })
  }

  return blocks
}

/** All searchable text in a block, flattened. */
export function blockText(block: Block): string {
  switch (block.kind) {
    case 'heading':
      return block.text
    case 'paragraph':
      return inlineText(block.inlines)
    case 'list':
      return block.items.map(inlineText).join(' ')
    case 'table':
      return [block.header, ...block.rows].map((row) => row.map(inlineText).join(' ')).join(' ')
    case 'quote':
      return block.blocks.map(blockText).join(' ')
    case 'code':
      return block.text
    case 'rule':
      return ''
  }
}
