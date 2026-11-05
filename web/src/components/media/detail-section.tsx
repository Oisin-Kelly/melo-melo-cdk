import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './media.css'

// A titled block under a detail page's header (Genre, Description, Shared with…): a small
// uppercase label, then its content.
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <VStack gap={2}>
      <Text type="label" size="sm" weight="semibold" color="secondary">
        {title.toUpperCase()}
      </Text>
      {children}
    </VStack>
  )
}

// Long text someone wrote (a description, bio or share caption) starts clamped to three
// lines with "Show more"; short text shows whole — the toggle only appears when it
// actually overflows the clamp. Keeps the writer's line breaks, at a comfortable line length.
// isTextToggle (a phone header's description): no "Show more" line — the text itself is
// the button, its "…" the hint, so it costs no extra line. Folded, its line breaks become
// spaces, so a preview reads as one flowing line rather than "desc" and a lone "…".
export function ExpandableText({
  text,
  type = 'body',
  color,
  lines = 3,
  isTextToggle = false,
}: {
  text: string
  type?: 'body' | 'supporting'
  color?: 'secondary'
  lines?: number
  isTextToggle?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current?.firstElementChild
    if (el && !isExpanded) setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [text, isExpanded])

  const shown = isTextToggle && !isExpanded ? text.replace(/\s+/g, ' ') : text
  const body = (
    <div ref={ref} className="mm-expandable-text">
      <Text
        type={type}
        color={color}
        textWrap="pretty"
        maxLines={isExpanded ? undefined : lines}
        hasTruncateTooltip={false}
      >
        {shown}
      </Text>
    </div>
  )

  if (isTextToggle)
    return overflows || isExpanded ? (
      <button
        type="button"
        className="mm-text-toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((value) => !value)}
      >
        {body}
      </button>
    ) : (
      body
    )

  return (
    <VStack gap={1} hAlign="start">
      {body}
      {(overflows || isExpanded) && (
        // A text link rather than a button, so it lines up with the text's edge
        <Link type={type} color="primary" weight="semibold" onClick={() => setIsExpanded((value) => !value)}>
          {isExpanded ? 'Show less' : 'Show more'}
        </Link>
      )}
    </VStack>
  )
}
