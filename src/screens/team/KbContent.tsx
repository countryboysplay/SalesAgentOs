/**
 * KbContent — renders knowledge-pack blocks as readable prose.
 *
 * Headings shift down one level because the article title is the screen's
 * h1. Tables become stacked label/value cards below 640px (see team.css),
 * because a six-column comparison is unreadable at 360px as a grid.
 */
import { Fragment, type ReactNode } from 'react'
import { inlineText, type Block, type Inline } from '@/kb/markdown'

/** DOM id for a topic heading. Prefixed so it never collides with app ids like #main. */
export const topicDomId = (topicId: string) => `kb-${topicId}`

function renderInlines(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case 'text':
        return <Fragment key={i}>{node.text}</Fragment>
      case 'strong':
        return <strong key={i}>{renderInlines(node.children)}</strong>
      case 'em':
        return <em key={i}>{renderInlines(node.children)}</em>
      case 'code':
        return <code key={i}>{node.text}</code>
      case 'link': {
        const safe = /^https?:\/\//i.test(node.href)
        return safe ? (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer">
            {renderInlines(node.children)}
          </a>
        ) : (
          <Fragment key={i}>{renderInlines(node.children)}</Fragment>
        )
      }
    }
  })
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'heading': {
      const Tag = block.level === 4 ? 'h3' : 'h2'
      return (
        <Tag id={topicDomId(block.id)} className={`kb-prose__h kb-prose__h--${block.level}`} tabIndex={-1}>
          {block.text}
        </Tag>
      )
    }
    case 'paragraph': {
      // A paragraph that is entirely bold is a key line in the source: give it weight.
      const only = block.inlines.length === 1 ? block.inlines[0] : undefined
      if (only?.kind === 'strong') {
        return <p className="kb-prose__key">{renderInlines(only.children)}</p>
      }
      return <p>{renderInlines(block.inlines)}</p>
    }
    case 'list': {
      const items = block.items.map((item, i) => <li key={i}>{renderInlines(item)}</li>)
      return block.ordered ? (
        <ol start={block.start === 1 ? undefined : block.start}>{items}</ol>
      ) : (
        <ul>{items}</ul>
      )
    }
    case 'table': {
      const labels = block.header.map(inlineText)
      return (
        <div className="kb-table">
          <table>
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i} scope="col" className={block.numeric[i] ? 'is-num' : undefined}>
                    {renderInlines(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      data-label={labels[i]}
                      className={block.numeric[i] ? 'is-num' : undefined}
                    >
                      {renderInlines(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'quote':
      return (
        <blockquote>
          {block.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </blockquote>
      )
    case 'code':
      return (
        <pre>
          <code>{block.text}</code>
        </pre>
      )
    case 'rule':
      return <hr />
  }
}

export function KbContent({ blocks }: { blocks: Block[] }) {
  return (
    <div className="kb-prose">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  )
}

export default KbContent
