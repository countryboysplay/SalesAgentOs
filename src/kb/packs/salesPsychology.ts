import type { PackManifest } from '../model'
import source from './sales-psychology.md?raw'

/**
 * Modern Inside-Sales Psychology — the evidence-based foundation pack.
 *
 * The Markdown keeps the owner's wording. Two edits were made on import:
 * citation markers left by the research tool were removed, and the bold
 * lead-ins that named each principle and practitioner became `###` headings
 * so they can be linked to and searched. The original flowchart is the
 * numbered list under "Evidence base".
 */
const principles = 'psychological-principles-mapped-to-inside-sales-behavior'

export const salesPsychology: PackManifest = {
  id: 'sales-psychology',
  title: 'Modern Inside-Sales Psychology',
  summary:
    'Why buyers resist, move, trust and hesitate — and how to guide a decision without taking it away from them.',
  source,
  featured: 'modern-inside-sales-psychology-cheat-sheet',
  split: ['one-page-field-cheat-sheet-and-source-library'],
  audience: {
    'training-and-implementation-system': 'coaching',
    'evidence-hierarchy-for-managers': 'coaching',
    'recommended-primary-and-practitioner-sources': 'coaching',
  },
  stages: {
    'modern-inside-sales-psychology-cheat-sheet': ['opener', 'discovery', 'pitch', 'objections', 'close'],
    [`${principles}#trust-and-credibility`]: ['opener', 'pitch'],
    [`${principles}#reciprocity`]: ['opener'],
    [`${principles}#rapport-and-listening`]: ['discovery'],
    [`${principles}#motivation-and-self-persuasion`]: ['discovery'],
    [`${principles}#loss-aversion`]: ['discovery', 'pitch'],
    'prioritized-inside-sales-tactics': ['discovery'],
    [`${principles}#framing`]: ['pitch'],
    [`${principles}#anchoring`]: ['pitch'],
    [`${principles}#social-proof`]: ['pitch'],
    [`${principles}#authority`]: ['pitch'],
    [`${principles}#choice-architecture`]: ['pitch', 'close'],
    [`${principles}#objections`]: ['objections'],
    [`${principles}#reactance-and-autonomy`]: ['objections', 'close'],
    'prioritized-inside-sales-tactics#what-your-team-should-explicitly-stop-believing': ['objections'],
    [`${principles}#scarcity`]: ['close'],
    [`${principles}#commitment-and-consistency`]: ['close'],
  },
}
