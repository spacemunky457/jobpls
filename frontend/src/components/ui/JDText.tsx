import { useMemo } from 'react'
import { cn } from '../../lib/cn'

/** Render a plain-text job description with structure: bullet lines become real
 * list items, short ALL-CAPS / colon-terminated lines become section headings,
 * everything else is a paragraph. Pure presentation — the stored text is the
 * single source of truth (and what the AI prompts consume). */

type Block =
  | { type: 'p' | 'h'; text: string }
  | { type: 'ul'; items: string[] }

const BULLET = /^\s*[•\-*–▪◦●]\s+/

function isHeading(line: string): boolean {
  const t = line.trim()
  if (t.length < 3 || t.length > 60) return false
  if (/[.!?]$/.test(t)) return false
  if (t.endsWith(':')) return true
  const letters = t.replace(/[^a-zA-Z]/g, '')
  return letters.length >= 3 && t === t.toUpperCase()
}

function parse(text: string): Block[] {
  // Old single-line scrapes embed bullets inline ("… • item • item"): split
  // them out when there are at least two.
  const lines = text
    .split('\n')
    .flatMap((line) => {
      const parts = line.split(/\s+•\s+/)
      if (parts.length < 3) return [line]
      return [parts[0], ...parts.slice(1).map((p) => `• ${p}`)]
    })
    .map((l) => l.trim())
    .filter(Boolean)

  const blocks: Block[] = []
  for (const line of lines) {
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, '')
      const last = blocks[blocks.length - 1]
      if (last?.type === 'ul') last.items.push(item)
      else blocks.push({ type: 'ul', items: [item] })
    } else if (isHeading(line)) {
      blocks.push({ type: 'h', text: line.replace(/:$/, '') })
    } else {
      blocks.push({ type: 'p', text: line })
    }
  }
  return blocks
}

export function JDText({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parse(text), [text])
  if (!blocks.length) return <p className={className}>No description captured.</p>
  return (
    <div className={cn('space-y-2', className)}>
      {blocks.map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i} className="space-y-1 pl-4">
            {b.items.map((item, j) => (
              <li key={j} className="list-disc">{item}</li>
            ))}
          </ul>
        ) : b.type === 'h' ? (
          <p key={i} className="pt-1.5 font-semibold uppercase tracking-wide text-ink first:pt-0">{b.text}</p>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  )
}
