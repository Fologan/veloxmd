// =============================================================================
// Extended Inline Parser — adds autolinks, reference links, HTML inline,
// footnote refs, link titles, hard breaks on top of the base parser
// =============================================================================

import type { LiveSegment } from './types.js'
import { parseLiveInline } from './parse-inline.js'

export function parseLiveInlinePlus(text: string): LiveSegment[] {
  const segments: LiveSegment[] = []
  let i = 0
  let buf = ''

  const flush = () => {
    if (buf) {
      // Run base parser on accumulated plain text
      segments.push(...parseLiveInline(buf))
      buf = ''
    }
  }

  while (i < text.length) {
    // HTML paired tags: <kbd>content</kbd>, <mark>content</mark>, <u>content</u>
    if (text[i] === '<') {
      const rest = text.slice(i)

      // Paired tags with content: <tag>...</tag>
      const pairedMatch = rest.match(/^<(kbd|mark|u|sup|sub)>(.*?)<\/\1>/)
      if (pairedMatch) {
        const [full, tag, content] = pairedMatch
        const kindMap: Record<string, string> = {
          kbd: 'keyboard', mark: 'highlight', u: 'underline',
          sup: 'superscript', sub: 'subscript',
        }
        flush()
        segments.push({ text: `<${tag}>`, kind: 'syntax' })
        segments.push({ text: content, kind: (kindMap[tag] || 'text') as any })
        segments.push({ text: `</${tag}>`, kind: 'syntax' })
        i += full.length
        continue
      }

      // Self-closing <br>, <br/>, <br />
      const brMatch = rest.match(/^<br\s*\/?>/)
      if (brMatch) {
        flush()
        segments.push({ text: brMatch[0], kind: 'hard-break' })
        i += brMatch[0].length
        continue
      }

      // Autolink: <https://...> or <email@domain>
      const end = text.indexOf('>', i + 1)
      if (end !== -1) {
        const inner = text.slice(i + 1, end)
        if (/^https?:\/\//.test(inner) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inner)) {
          flush()
          segments.push({ text: '<', kind: 'syntax' })
          segments.push({ text: inner, kind: 'autolink' })
          segments.push({ text: '>', kind: 'syntax' })
          i = end + 1
          continue
        }
        // Other HTML tags (details, summary, closing tags, comments, etc.)
        const tagMatch = inner.match(/^\/?(kbd|mark|u|br|sup|sub|details|summary)(\s[^>]*)?\/?$/)
        if (tagMatch) {
          flush()
          segments.push({ text: `<${inner}>`, kind: 'html-tag' })
          i = end + 1
          continue
        }
      }
    }

    // Image: ![alt](url), ![alt](url "title"), ![alt][ref]
    if (text[i] === '!' && text[i + 1] === '[') {
      const altEnd = text.indexOf(']', i + 2)
      if (altEnd !== -1) {
        // ![alt](url "title") — with title
        if (text[altEnd + 1] === '(') {
          const parenContent = text.slice(altEnd + 2)
          const titleMatch = parenContent.match(/^(\S+)\s+"([^"]*)"(\))/)
          if (titleMatch) {
            flush()
            segments.push({ text: '![', kind: 'syntax' })
            segments.push({ text: text.slice(i + 2, altEnd), kind: 'image-alt' })
            segments.push({ text: '](', kind: 'syntax' })
            segments.push({ text: titleMatch[1], kind: 'image-url' })
            segments.push({ text: ' "', kind: 'syntax' })
            segments.push({ text: titleMatch[2], kind: 'link-title' })
            segments.push({ text: '")', kind: 'syntax' })
            i = altEnd + 2 + titleMatch[0].length
            continue
          }
          // ![alt](url) — without title
          const urlEnd = text.indexOf(')', altEnd + 2)
          if (urlEnd !== -1) {
            flush()
            segments.push({ text: '![', kind: 'syntax' })
            segments.push({ text: text.slice(i + 2, altEnd), kind: 'image-alt' })
            segments.push({ text: '](', kind: 'syntax' })
            segments.push({ text: text.slice(altEnd + 2, urlEnd), kind: 'image-url' })
            segments.push({ text: ')', kind: 'syntax' })
            i = urlEnd + 1
            continue
          }
        }
        // ![alt][ref] — image reference
        if (text[altEnd + 1] === '[') {
          const refEnd = text.indexOf(']', altEnd + 2)
          if (refEnd !== -1) {
            flush()
            segments.push({ text: '![', kind: 'syntax' })
            segments.push({ text: text.slice(i + 2, altEnd), kind: 'image-alt' })
            segments.push({ text: '][', kind: 'syntax' })
            segments.push({ text: text.slice(altEnd + 2, refEnd), kind: 'ref-link-label' })
            segments.push({ text: ']', kind: 'syntax' })
            i = refEnd + 1
            continue
          }
        }
      }
    }

    // Footnote reference: [^label]
    if (text[i] === '[' && text[i + 1] === '^') {
      const end = text.indexOf(']', i + 2)
      if (end !== -1 && !/\s/.test(text.slice(i + 2, end))) {
        flush()
        segments.push({ text: '[^', kind: 'syntax' })
        segments.push({ text: text.slice(i + 2, end), kind: 'footnote-ref' })
        segments.push({ text: ']', kind: 'syntax' })
        i = end + 1
        continue
      }
    }

    // Reference link: [text][ref]
    if (text[i] === '[') {
      const textEnd = text.indexOf(']', i + 1)
      if (textEnd !== -1 && text[textEnd + 1] === '[') {
        const refEnd = text.indexOf(']', textEnd + 2)
        if (refEnd !== -1) {
          flush()
          segments.push({ text: '[', kind: 'syntax' })
          segments.push({ text: text.slice(i + 1, textEnd), kind: 'ref-link-text' })
          segments.push({ text: '][', kind: 'syntax' })
          segments.push({ text: text.slice(textEnd + 2, refEnd), kind: 'ref-link-label' })
          segments.push({ text: ']', kind: 'syntax' })
          i = refEnd + 1
          continue
        }
      }
      // Link with title: [text](url "title")
      if (textEnd !== -1 && text[textEnd + 1] === '(') {
        const parenContent = text.slice(textEnd + 2)
        const titleMatch = parenContent.match(/^(\S+)\s+"([^"]*)"(\))/)
        if (titleMatch) {
          const urlEnd = textEnd + 2 + titleMatch[0].length - 1
          flush()
          segments.push({ text: '[', kind: 'syntax' })
          segments.push({ text: text.slice(i + 1, textEnd), kind: 'link-text' })
          segments.push({ text: '](', kind: 'syntax' })
          segments.push({ text: titleMatch[1], kind: 'link-url' })
          segments.push({ text: ' "', kind: 'syntax' })
          segments.push({ text: titleMatch[2], kind: 'link-title' })
          segments.push({ text: '")', kind: 'syntax' })
          i = urlEnd + 1
          continue
        }
      }
    }

    // Inline math: $...$  (not $$)
    if (text[i] === '$' && text[i + 1] !== '$') {
      const end = text.indexOf('$', i + 1)
      if (end !== -1 && end > i + 1) {
        flush()
        segments.push({ text: '$', kind: 'syntax' })
        segments.push({ text: text.slice(i + 1, end), kind: 'math-inline' })
        segments.push({ text: '$', kind: 'syntax' })
        i = end + 1
        continue
      }
    }

    // Superscript: ^text^ (not at start of line to avoid heading conflicts)
    if (text[i] === '^' && i > 0) {
      const end = text.indexOf('^', i + 1)
      if (end !== -1 && end > i + 1 && !/\s/.test(text.slice(i + 1, end))) {
        flush()
        segments.push({ text: '^', kind: 'syntax' })
        segments.push({ text: text.slice(i + 1, end), kind: 'superscript' })
        segments.push({ text: '^', kind: 'syntax' })
        i = end + 1
        continue
      }
    }

    // Subscript: ~text~ (single ~, not ~~)
    if (text[i] === '~' && text[i + 1] !== '~') {
      const end = text.indexOf('~', i + 1)
      if (end !== -1 && end > i + 1 && text[end + 1] !== '~' && !/\s/.test(text.slice(i + 1, end))) {
        flush()
        segments.push({ text: '~', kind: 'syntax' })
        segments.push({ text: text.slice(i + 1, end), kind: 'subscript' })
        segments.push({ text: '~', kind: 'syntax' })
        i = end + 1
        continue
      }
    }

    buf += text[i]
    i++
  }

  flush()

  // Post-process: detect hard line breaks (trailing two spaces)
  if (segments.length > 0) {
    const last = segments[segments.length - 1]
    if (last.kind === 'text' && last.text.endsWith('  ')) {
      const trimmed = last.text.slice(0, -2)
      segments.pop()
      if (trimmed) segments.push({ text: trimmed, kind: 'text' })
      segments.push({ text: '  ', kind: 'hard-break' })
    }
  }

  return segments
}
