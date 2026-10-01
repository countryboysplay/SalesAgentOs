/**
 * search — offline full-text search over the shipped knowledge packs.
 *
 * The corpus is a few hundred paragraphs, so a linear scan over pre-tokenised
 * entries is instant on a phone and needs no index structure beyond that.
 * Each paragraph, list or table is one entry, attributed to the topic it sits
 * under, so a result lands on the right spot instead of the top of a long article.
 *
 * Matching: every query word must prefix-match a word in the entry or its
 * heading ("objection" finds "objections"). If nothing matches all words, the
 * search falls back to entries matching the most words, so a long question
 * still returns something useful.
 */
import { blockText, inlineText } from './markdown'
import type { KbRef, Pack } from './model'

export interface SearchEntry {
  ref: KbRef
  packTitle: string
  text: string
  tokens: string[]
  titleTokens: string[]
}

export interface SearchIndex {
  entries: SearchEntry[]
}

export interface SearchResult extends KbRef {
  packTitle: string
  snippet: string
  score: number
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'does', 'for', 'how', 'i',
  'if', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'so', 'the', 'their', 'they',
  'to', 'vs', 'what', 'when', 'with', 'you', 'your',
])

/** Lowercase, accent-folded words. */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Query words worth matching on. Stop words drop out unless they are all there is. */
export function queryTerms(query: string): string[] {
  const all = tokenize(query)
  const meaningful = all.filter((t) => !STOP_WORDS.has(t))
  return [...new Set(meaningful.length > 0 ? meaningful : all)]
}

export function buildIndex(packs: Pack[]): SearchIndex {
  const entries: SearchEntry[] = []

  for (const pack of packs) {
    for (const article of pack.articles) {
      let ref: KbRef = { articleId: article.id, title: article.title }

      for (const block of article.blocks) {
        if (block.kind === 'heading') {
          if (block.level === 3) {
            ref = {
              articleId: article.id,
              topicId: block.id,
              title: block.text,
              context: article.title,
            }
          }
          continue
        }
        // A table row is a self-contained idea ("Price · Create a meaningful
        // reference point · …"), so each row is its own entry and snippet.
        const texts =
          block.kind === 'table'
            ? block.rows.map((row) => row.map(inlineText).filter(Boolean).join(' · '))
            : [blockText(block)]
        for (const text of texts) {
          if (!text.trim()) continue
          entries.push({
            ref,
            packTitle: pack.title,
            text,
            tokens: tokenize(text),
            titleTokens: tokenize(`${ref.title} ${ref.context ?? ''}`),
          })
        }
      }
    }
  }

  return { entries }
}

function countPrefix(tokens: string[], term: string): number {
  let n = 0
  for (const token of tokens) if (token.startsWith(term)) n += 1
  return n
}

/** A window of `text` around the first query hit, trimmed to whole words. */
export function makeSnippet(text: string, terms: string[], width = 180): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= width) return clean

  const lower = clean.toLowerCase()
  let hit = -1
  for (const term of terms) {
    const at = lower.search(new RegExp(`\\b${escapeRegExp(term)}`))
    if (at !== -1 && (hit === -1 || at < hit)) hit = at
  }

  let start = hit <= 40 ? 0 : hit - 40
  if (start > 0) {
    const space = clean.indexOf(' ', start)
    start = space === -1 ? start : space + 1
  }
  let end = Math.min(clean.length, start + width)
  if (end < clean.length) {
    const space = clean.lastIndexOf(' ', end)
    end = space > start ? space : end
  }

  return `${start > 0 ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`
}

export function search(index: SearchIndex, query: string, limit = 20): SearchResult[] {
  const terms = queryTerms(query)
  if (terms.length === 0) return []

  const scored = index.entries
    .map((entry) => {
      let matched = 0
      let score = 0
      for (const term of terms) {
        const inBody = countPrefix(entry.tokens, term)
        const inTitle = countPrefix(entry.titleTokens, term)
        if (inBody + inTitle > 0) matched += 1
        score += Math.min(inBody, 5) + (inTitle > 0 ? 6 : 0)
      }
      return { entry, matched, score }
    })
    .filter((s) => s.matched > 0)

  const best = Math.max(0, ...scored.map((s) => s.matched))
  // Require every word when possible; otherwise the best partial matches.
  const needed = best === terms.length ? terms.length : best

  // One result per article/topic: its best paragraph.
  const byRef = new Map<string, SearchResult>()
  for (const { entry, matched, score } of scored) {
    if (matched < needed) continue
    const key = `${entry.ref.articleId}#${entry.ref.topicId ?? ''}`
    const existing = byRef.get(key)
    if (!existing || score > existing.score) {
      byRef.set(key, {
        ...entry.ref,
        packTitle: entry.packTitle,
        snippet: makeSnippet(entry.text, terms),
        score,
      })
    }
  }

  return [...byRef.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Splits text into plain and matched runs, for highlighting query words. */
export function highlight(text: string, query: string): { text: string; match: boolean }[] {
  const terms = queryTerms(query)
  if (terms.length === 0) return [{ text, match: false }]
  const pattern = new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})[a-z0-9]*`, 'gi')
  const out: { text: string; match: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), match: false })
    out.push({ text: m[0], match: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), match: false })
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
