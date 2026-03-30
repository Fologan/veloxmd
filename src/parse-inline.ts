// =============================================================================
// Base Inline Parser — preserves syntax markers for 1:1 cursor mapping
// =============================================================================

import type { LiveSegment } from './types.js'

export function parseLiveInline(text: string): LiveSegment[] {
  const segments: LiveSegment[] = []
  let i = 0
  let buf = ''

  const flush = () => {
    if (buf) {
      segments.push({ text: buf, kind: 'text' })
      buf = ''
    }
  }

  while (i < text.length) {
    // Escape: \* \_ etc.
    if (text[i] === '\\' && i + 1 < text.length && /[\\`*_~\[\]!#]/.test(text[i + 1])) {
      flush()
      segments.push({ text: '\\', kind: 'syntax' })
      buf += text[i + 1]
      i += 2
      continue
    }

    // Inline code: `...`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        flush()
        segments.push({ text: '`', kind: 'syntax' })
        segments.push({ text: text.slice(i + 1, end), kind: 'code' })
        segments.push({ text: '`', kind: 'syntax' })
        i = end + 1
        continue
      }
    }

    // Image: ![alt](url)
    if (text[i] === '!' && text[i + 1] === '[') {
      const altEnd = text.indexOf(']', i + 2)
      if (altEnd !== -1 && text[altEnd + 1] === '(') {
        const urlEnd = text.indexOf(')', altEnd + 2)
        if (urlEnd !== -1) {
          flush()
          segments.push({ text: '![', kind: 'syntax' })
          segments.push({ text: text.slice(i + 2, altEnd), kind: 'link-text' })
          segments.push({ text: '](', kind: 'syntax' })
          segments.push({ text: text.slice(altEnd + 2, urlEnd), kind: 'link-url' })
          segments.push({ text: ')', kind: 'syntax' })
          i = urlEnd + 1
          continue
        }
      }
    }

    // Link: [text](url)
    if (text[i] === '[') {
      const textEnd = text.indexOf(']', i + 1)
      if (textEnd !== -1 && text[textEnd + 1] === '(') {
        const urlEnd = text.indexOf(')', textEnd + 2)
        if (urlEnd !== -1) {
          flush()
          segments.push({ text: '[', kind: 'syntax' })
          segments.push({ text: text.slice(i + 1, textEnd), kind: 'link-text' })
          segments.push({ text: '](', kind: 'syntax' })
          segments.push({ text: text.slice(textEnd + 2, urlEnd), kind: 'link-url' })
          segments.push({ text: ')', kind: 'syntax' })
          i = urlEnd + 1
          continue
        }
      }
    }

    // Strikethrough: ~~text~~
    if (text[i] === '~' && text[i + 1] === '~') {
      const end = text.indexOf('~~', i + 2)
      if (end !== -1) {
        flush()
        segments.push({ text: '~~', kind: 'syntax' })
        segments.push({ text: text.slice(i + 2, end), kind: 'strikethrough' })
        segments.push({ text: '~~', kind: 'syntax' })
        i = end + 2
        continue
      }
    }

    // Bold italic: ***text***
    if (
      (text[i] === '*' || text[i] === '_') &&
      i + 2 < text.length &&
      text[i + 1] === text[i] &&
      text[i + 2] === text[i]
    ) {
      const marker = text[i].repeat(3)
      const end = text.indexOf(marker, i + 3)
      if (end !== -1) {
        flush()
        segments.push({ text: marker, kind: 'syntax' })
        const inner = parseLiveInline(text.slice(i + 3, end))
        for (const seg of inner) {
          segments.push(seg.kind === 'text' ? { ...seg, kind: 'bold-italic' } : seg)
        }
        segments.push({ text: marker, kind: 'syntax' })
        i = end + 3
        continue
      }
    }

    // Bold: **text**
    if (
      (text[i] === '*' || text[i] === '_') &&
      i + 1 < text.length &&
      text[i + 1] === text[i]
    ) {
      const marker = text[i].repeat(2)
      const end = text.indexOf(marker, i + 2)
      if (end !== -1) {
        flush()
        segments.push({ text: marker, kind: 'syntax' })
        const inner = parseLiveInline(text.slice(i + 2, end))
        for (const seg of inner) {
          segments.push(seg.kind === 'text' ? { ...seg, kind: 'bold' } : seg)
        }
        segments.push({ text: marker, kind: 'syntax' })
        i = end + 2
        continue
      }
    }

    // Italic: *text*
    if (text[i] === '*' || text[i] === '_') {
      const marker = text[i]
      const end = text.indexOf(marker, i + 1)
      if (end !== -1 && end > i + 1) {
        flush()
        segments.push({ text: marker, kind: 'syntax' })
        const inner = parseLiveInline(text.slice(i + 1, end))
        for (const seg of inner) {
          segments.push(seg.kind === 'text' ? { ...seg, kind: 'italic' } : seg)
        }
        segments.push({ text: marker, kind: 'syntax' })
        i = end + 1
        continue
      }
    }

    buf += text[i]
    i++
  }

  flush()
  return segments
}
