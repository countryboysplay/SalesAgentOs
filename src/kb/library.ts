/**
 * library — every shipped knowledge pack, built once at module load.
 *
 * To add a pack: drop its Markdown in ./packs, write a manifest next to it,
 * and list it in MANIFESTS. Order here is the order on the Playbook screen.
 */
import {
  CALL_STAGES,
  buildPack,
  stageRefs,
  type Article,
  type CallStage,
  type KbRef,
  type Pack,
  type PackManifest,
} from './model'
import { buildIndex, type SearchIndex } from './search'
import { salesPsychology } from './packs/salesPsychology'

const MANIFESTS: PackManifest[] = [salesPsychology]

export interface Library {
  packs: Pack[]
  articles: Map<string, Article>
  /** Only stages that have content, in call order. */
  stages: { id: CallStage; label: string; blurb: string; refs: KbRef[] }[]
  index: SearchIndex
}

export function buildLibrary(manifests: PackManifest[]): Library {
  const packs = manifests.map(buildPack)
  const articles = new Map<string, Article>()
  for (const pack of packs) for (const article of pack.articles) articles.set(article.id, article)

  const byStage = new Map<CallStage, KbRef[]>()
  manifests.forEach((manifest, i) => {
    for (const [stage, refs] of stageRefs(manifest, packs[i]!)) {
      byStage.set(stage, [...(byStage.get(stage) ?? []), ...refs])
    }
  })

  const stages = CALL_STAGES.filter((s) => byStage.has(s.id)).map((s) => ({
    id: s.id,
    label: s.label,
    blurb: s.blurb,
    refs: byStage.get(s.id)!,
  }))

  return { packs, articles, stages, index: buildIndex(packs) }
}

let cached: Library | null = null

/** The shipped library. Built on first use, then held in memory. */
export function getLibrary(): Library {
  cached ??= buildLibrary(MANIFESTS)
  return cached
}
