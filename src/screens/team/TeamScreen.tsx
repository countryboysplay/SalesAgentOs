/**
 * Team — the fifth tab. Today it holds the Playbook (the call knowledge
 * base); the team boards join it as a second section.
 *
 * Routes, all read here via useSubRoute('/team'):
 *   #/team?q=price                     Playbook home, or search results
 *   #/team/stage/discovery             one call stage
 *   #/team/pack/sales-psychology       one pack's contents
 *   #/team/read/<pack>/<article>?at=<topic>
 *
 * Content is bundled with the app, so every view here works offline and
 * nothing is read from or written to IndexedDB.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Card, EmptyState, PageHeader } from '@/components'
import { Link, ROUTES, useRouter } from '@/app/router'
import { getLibrary } from '@/kb/library'
import type { Article, CallStage, KbRef } from '@/kb/model'
import { highlight, search } from '@/kb/search'
import { KbContent, topicDomId } from './KbContent'
import './team.css'

const readPath = (articleId: string) => `${ROUTES.team}/read/${articleId}`

export default function TeamScreen() {
  const { segments } = useRouter()
  const [, view, a, b] = segments

  if (view === 'read' && a && b) return <ArticleView articleId={`${a}/${b}`} />
  if (view === 'stage' && a) return <StageView stageId={a} />
  if (view === 'pack' && a) return <PackView packId={a} />
  return <PlaybookHome />
}

/* -------------------------------------------------------------- shared rows */

const Chevron = () => (
  <svg className="kb-row__chevron" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function Row({
  to,
  query,
  title,
  sub,
  meta,
}: {
  to: string
  query?: Record<string, string | undefined>
  title: ReactNode
  sub?: ReactNode
  meta?: ReactNode
}) {
  return (
    <li>
      <Link to={to} query={query} className="kb-row focus-inset">
        <span className="kb-row__text">
          {meta && <span className="kb-row__meta">{meta}</span>}
          <span className="kb-row__title">{title}</span>
          {sub && <span className="kb-row__sub">{sub}</span>}
        </span>
        <Chevron />
      </Link>
    </li>
  )
}

function RefRow({ refItem }: { refItem: KbRef }) {
  return (
    <Row
      to={readPath(refItem.articleId)}
      query={{ at: refItem.topicId }}
      title={refItem.title}
      sub={refItem.context}
    />
  )
}

function NotFound({ what }: { what: string }) {
  const { navigate } = useRouter()
  return (
    <div className="shell-stack">
      <PageHeader title="Playbook" onBack={() => navigate(ROUTES.team)} backLabel="Back to Playbook" />
      <EmptyState
        headingLevel={2}
        title={`That ${what} isn't in this version of the Playbook.`}
        body="It may have been renamed. Everything current is listed on the Playbook page."
      />
    </div>
  )
}

/* -------------------------------------------------------------------- home */

function PlaybookHome() {
  const { query, setQuery } = useRouter()
  const lib = getLibrary()
  const [text, setText] = useState(query.q ?? '')

  // Keep the URL in step so back/forward and a reload restore the search.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if ((query.q ?? '') !== text) setQuery({ q: text || undefined })
    }, 250)
    return () => window.clearTimeout(handle)
  }, [text, query.q, setQuery])

  const results = useMemo(() => search(lib.index, text), [lib, text])
  const searching = text.trim().length > 0
  const featured = lib.packs.flatMap((p) => (p.featured ? [p.featured] : []))

  return (
    <div className="kb shell-stack">
      <PageHeader title="Team" subtitle="Playbook · how to run a great call" />

      <div className="kb-search" role="search">
        <svg className="kb-search__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="8.6" cy="8.6" r="5.4" />
          <path d="M12.6 12.6 17 17" />
        </svg>
        <input
          className="kb-search__input"
          type="search"
          value={text}
          placeholder="Search the Playbook"
          aria-label="Search the Playbook"
          enterKeyHint="search"
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      {searching ? (
        <SearchResults query={text} results={results} />
      ) : (
        <>
          {featured.map((article, i) => (
            <Card key={article.id} tone={i === 0 ? 'accent' : 'default'} padding="none">
              <ul className="kb-list">
                <Row
                  to={readPath(article.id)}
                  meta="Start here"
                  title={article.title}
                  sub="The whole call on one page"
                />
              </ul>
            </Card>
          ))}

          {lib.stages.length > 0 && (
            <Card padding="none">
          <h2 className="kb-card-title">By call stage</h2>
              <ul className="kb-list">
                {lib.stages.map((stage) => (
                  <Row
                    key={stage.id}
                    to={`${ROUTES.team}/stage/${stage.id}`}
                    title={stage.label}
                    sub={stage.blurb}
                  />
                ))}
              </ul>
            </Card>
          )}

          <Card padding="none">
          <h2 className="kb-card-title">Training packs</h2>
            <ul className="kb-list">
              {lib.packs.map((pack) => (
                <Row
                  key={pack.id}
                  to={`${ROUTES.team}/pack/${pack.id}`}
                  title={pack.title}
                  sub={pack.summary}
                />
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}

function SearchResults({ query, results }: { query: string; results: ReturnType<typeof search> }) {
  if (results.length === 0) {
    return (
      <EmptyState
        headingLevel={2}
        title={`Nothing in the Playbook mentions “${query.trim()}”.`}
        body="Try a shorter word, like “price”, “listen” or “urgency”."
      />
    )
  }
  return (
    <Card padding="none">
      <h2 className="sr-only">Results</h2>
      <p className="kb-count" aria-live="polite">
        {results.length === 1 ? '1 match' : `${results.length} matches`}
      </p>
      <ul className="kb-list">
        {results.map((r) => (
          <Row
            key={`${r.articleId}#${r.topicId ?? ''}`}
            to={readPath(r.articleId)}
            query={{ at: r.topicId }}
            meta={r.context ?? r.packTitle}
            title={<Highlighted text={r.title} query={query} />}
            sub={
              <span className="kb-row__snippet">
                <Highlighted text={r.snippet} query={query} />
              </span>
            }
          />
        ))}
      </ul>
    </Card>
  )
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((run, i) =>
        run.match ? <mark key={i}>{run.text}</mark> : <span key={i}>{run.text}</span>,
      )}
    </>
  )
}

/* ------------------------------------------------------------------- stage */

function StageView({ stageId }: { stageId: string }) {
  const { back } = useRouter()
  const stage = getLibrary().stages.find((s) => s.id === (stageId as CallStage))
  if (!stage) return <NotFound what="call stage" />

  return (
    <div className="kb shell-stack">
      <PageHeader title={stage.label} subtitle={stage.blurb} onBack={back} backLabel="Back" />
      <Card padding="none">
        <ul className="kb-list">
          {stage.refs.map((ref) => (
            <RefRow key={`${ref.articleId}#${ref.topicId ?? ''}`} refItem={ref} />
          ))}
        </ul>
      </Card>
    </div>
  )
}

/* -------------------------------------------------------------------- pack */

function PackView({ packId }: { packId: string }) {
  const { back } = useRouter()
  const pack = getLibrary().packs.find((p) => p.id === packId)
  if (!pack) return <NotFound what="training pack" />

  const forAgents = pack.articles.filter((a) => a.audience === 'agent')
  const forCoaching = pack.articles.filter((a) => a.audience === 'coaching')
  const topicsLine = (article: Article) =>
    article.topics.length === 0
      ? undefined
      : `${article.topics.length} ${article.topics.length === 1 ? 'topic' : 'topics'}`

  return (
    <div className="kb shell-stack">
      <PageHeader title={pack.title} subtitle={pack.summary} onBack={back} backLabel="Back" />
      <Card padding="none">
          <h2 className="kb-card-title">Read</h2>
        <ul className="kb-list">
          {forAgents.map((article) => (
            <Row key={article.id} to={readPath(article.id)} title={article.title} sub={topicsLine(article)} />
          ))}
        </ul>
      </Card>
      {forCoaching.length > 0 && (
        <Card padding="none">
          <h2 className="kb-card-title">For coaching</h2>
          <p className="kb-card-note">Training plans, scorecards and sources, for managers and self-coaching.</p>
          <ul className="kb-list">
            {forCoaching.map((article) => (
              <Row key={article.id} to={readPath(article.id)} title={article.title} sub={topicsLine(article)} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- article */

function ArticleView({ articleId }: { articleId: string }) {
  const { query, back, setQuery } = useRouter()
  const lib = getLibrary()
  const article = lib.articles.get(articleId)
  const at = query.at

  // Jump to the requested topic. Deferred a frame: the shell scrolls to the
  // top on every route change, and its effect runs after this one.
  useEffect(() => {
    if (!at) return
    const frame = window.requestAnimationFrame(() => {
      const el = document.getElementById(topicDomId(at))
      if (!el) return
      el.scrollIntoView({ block: 'start' })
      el.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [articleId, at])

  if (!article) return <NotFound what="article" />

  const pack = lib.packs.find((p) => p.id === article.packId)!
  const siblings = pack.articles.filter((a) => a.audience === article.audience)
  const index = siblings.findIndex((a) => a.id === article.id)
  const next = siblings[index + 1]

  return (
    <div className="kb shell-stack">
      <PageHeader
        title={article.title}
        subtitle={article.audience === 'coaching' ? `${pack.title} · For coaching` : pack.title}
        onBack={back}
        backLabel="Back"
      />

      {article.topics.length > 1 && (
        <nav className="kb-topics" aria-label="Topics in this article">
          {article.topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              className="kb-topics__item"
              aria-current={at === topic.id ? 'location' : undefined}
              onClick={() => {
                if (at === topic.id) {
                  document.getElementById(topicDomId(topic.id))?.scrollIntoView({ block: 'start' })
                } else {
                  setQuery({ at: topic.id })
                }
              }}
            >
              {topic.title}
            </button>
          ))}
        </nav>
      )}

      <Card padding="lg" as="article">
        <KbContent blocks={article.blocks} />
      </Card>

      {next && (
        <Card padding="none">
          <ul className="kb-list">
            <Row to={readPath(next.id)} meta="Next" title={next.title} />
          </ul>
        </Card>
      )}
    </div>
  )
}
