import type { LiveSegment } from '../../types.js'

export type ParsedReferenceInline = {
  readonly length: number
  readonly segments: LiveSegment[]
}

export function parseWikilinkInline(
  text: string,
  offset: number,
): ParsedReferenceInline | null {
  const embed = text.startsWith('![[', offset)
  const wikilink = !embed && text.startsWith('[[', offset)
  if (!embed && !wikilink) return null

  const opening = embed ? '![[' : '[['
  const contentStart = offset + opening.length
  const end = text.indexOf(']]', contentStart)
  if (end === -1) return null

  const content = text.slice(contentStart, end)
  const separator = content.indexOf('|')
  const target = (separator === -1 ? content : content.slice(0, separator)).trim()
  const label = separator === -1 ? '' : content.slice(separator + 1).trim()
  if (!target) return null

  const reference = {
    target,
    syntax: embed ? ('wikilink-embed' as const) : ('wikilink' as const),
    embed,
    ...(label ? { label } : {}),
  }
  const segments: LiveSegment[] = [
    { text: opening, kind: 'syntax' },
    { text: separator === -1 ? content : content.slice(0, separator), kind: 'reference-target', reference },
  ]
  if (separator !== -1) {
    segments.push(
      { text: '|', kind: 'syntax' },
      { text: content.slice(separator + 1), kind: 'reference-label', reference },
    )
  }
  segments.push({ text: ']]', kind: 'syntax' })

  return {
    length: end + 2 - offset,
    segments,
  }
}
