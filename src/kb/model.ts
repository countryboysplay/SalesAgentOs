/**
 * Knowledge base content model.
 *
 * A *pack* is one piece of the owner's training material, kept in their
 * wording as a Markdown file. It is cut into *articles*, the unit an agent
 * opens and reads: by default one per `##` section. Within an article, each
 * `###` heading is a *topic*, the unit a call stage or a search result links to.
 *
 * Shipped content is read-only and is part of the app bundle, so it is
 * available offline from first install and is never part of a backup.
 */
import { blockText, parseMarkdown, type Block } from './markdown'

/* ------------------------------------------------------------------ stages */

/** The call structure the knowledge base is organized around. */
export const CALL_STAGES = [
  { id: 'opener', label: 'Opener', blurb: 'The first seconds: earn the right to a conversation.' },
  { id: 'discovery', label: 'Discovery', blurb: 'Understand the situation before offering anything.' },
  { id: 'pitch', label: 'Program pitch', blurb: 'Connect the program to what they told you.' },
  { id: 'objections', label: 'Objection handling', blurb: 'Learn what the concern means before answering it.' },
  { id: 'close', label: 'Close', blurb: 'A clear, voluntary next commitment.' },
  { id: 'recap', label: 'Recap', blurb: 'Confirm what was agreed and what happens next.' },
] as const

export type CallStage = (typeof CALL_STAGES)[number]['id']

/** Who an article is written for. Coaching articles are grouped separately. */
export type Audience = 'agent' | 'coaching'

/* ---------------------------------------------------------------- manifest */

export interface PackManifest {
  /** Stable id used in URLs. Never change it once shipped. */
  id: string
  title: string
  /** One or two sentences shown on the pack card. */
  summary: string
  /** The Markdown source. */
  source: string
  /** Article slug to open first, e.g. a one-page cheat sheet. */
  featured?: string
  /** `##` section slugs whose `###` headings each become their own article. */
  split?: string[]
  /** Article slug -> audience. Unlisted articles are 'agent'. */
  audience?: Record<string, Audience>
  /**
   * Call-stage tags. Keys are an article slug (`cheat-sheet`) or an article
   * slug plus topic slug (`principles#framing`).
   */
  stages?: Record<string, CallStage[]>
}

/* ------------------------------------------------------------------- built */

export interface Topic {
  id: string
  title: string
}

export interface Article {
  /** Globally unique: `${packId}/${slug}`. */
  id: string
  slug: string
  packId: string
  title: string
  audience: Audience
  blocks: Block[]
  topics: Topic[]
}

export interface Pack {
  id: string
  title: string
  summary: string
  articles: Article[]
  featured?: Article
}

/** A link into the knowledge base: an article, optionally at a topic. */
export interface KbRef {
  articleId: string
  topicId?: string
  title: string
  /** Article title when `title` is a topic within it. */
  context?: string
}

/* ------------------------------------------------------------------- build */

/** Cuts a pack's Markdown into articles according to its manifest. */
export function buildPack(manifest: PackManifest): Pack {
  const blocks = parseMarkdown(manifest.source)
  const split = new Set(manifest.split ?? [])
  const articles: Article[] = []

  let current: Article | null = null
  // Blocks before the first `##`, or a split section's intro before its first `###`.
  let pending: Block[] = []
  let splitting = false

  const open = (title: string, slug: string): Article => {
    const article: Article = {
      id: `${manifest.id}/${slug}`,
      slug,
      packId: manifest.id,
      title,
      audience: manifest.audience?.[slug] ?? 'agent',
      blocks: pending,
      topics: [],
    }
    pending = []
    articles.push(article)
    return article
  }

  for (const block of blocks) {
    if (block.kind === 'heading' && block.level === 2) {
      splitting = split.has(block.id)
      current = null
      if (!splitting) current = open(block.text, block.id)
      continue
    }
    if (block.kind === 'heading' && block.level === 3 && splitting) {
      current = open(block.text, block.id)
      continue
    }
    const target = current as Article | null
    if (target === null) {
      pending.push(block)
      continue
    }
    if (block.kind === 'heading' && block.level === 3) {
      target.topics.push({ id: block.id, title: block.text })
    }
    target.blocks.push(block)
  }

  const featured = manifest.featured
    ? articles.find((a) => a.slug === manifest.featured)
    : undefined
  if (manifest.featured && !featured) {
    throw new Error(`Knowledge pack "${manifest.id}": unknown featured article "${manifest.featured}"`)
  }
  return { id: manifest.id, title: manifest.title, summary: manifest.summary, articles, featured }
}

/** Resolves a manifest's stage tags into links, in call-stage order. */
export function stageRefs(
  manifest: PackManifest,
  pack: Pack,
): Map<CallStage, KbRef[]> {
  const out = new Map<CallStage, KbRef[]>()
  for (const [key, stages] of Object.entries(manifest.stages ?? {})) {
    const [articleSlug = '', topicSlug] = key.split('#')
    const article = pack.articles.find((a) => a.slug === articleSlug)
    if (!article) throw new Error(`Knowledge pack "${pack.id}": unknown article "${articleSlug}"`)
    let ref: KbRef = { articleId: article.id, title: article.title }
    if (topicSlug) {
      const topic = article.topics.find((t) => t.id === topicSlug)
      if (!topic) throw new Error(`Knowledge pack "${pack.id}": unknown topic "${key}"`)
      ref = { articleId: article.id, topicId: topic.id, title: topic.title, context: article.title }
    }
    for (const stage of stages) {
      const list = out.get(stage) ?? []
      list.push(ref)
      out.set(stage, list)
    }
  }
  return out
}

/** Plain text of an article's blocks, for search. */
export function articleText(article: Article): string {
  return article.blocks.map(blockText).join(' ')
}
