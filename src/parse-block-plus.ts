// =============================================================================
// Extended Block Parser — adds tables, task lists, nested blockquotes,
// alt headings, footnote defs, HTML comments, details blocks
// =============================================================================

import type { LiveLine, LiveSegment, ParseState } from './types.js'
import { parseLiveInlinePlus } from './parse-inline-plus.js'

function createState(): ParseState {
  return {
    inCodeBlock: false,
    inTable: false,
    inMathBlock: false,
    tableAlignments: [],
  }
}

function parseTableCells(raw: string): LiveSegment[] {
  const segments: LiveSegment[] = []
  const cells = raw.split('|')

  for (let c = 0; c < cells.length; c++) {
    if (c > 0) segments.push({ text: '|', kind: 'syntax' })
    const cell = cells[c]
    if (cell.length > 0) {
      segments.push(...parseLiveInlinePlus(cell))
    }
  }
  return segments
}

function isTableSeparator(line: string): boolean {
  return /^\|?[\s:]*-{3,}[\s:]*(\|[\s:]*-{3,}[\s:]*)*\|?\s*$/.test(line.trim())
}

function parseAlignments(line: string): ('left' | 'center' | 'right' | 'default')[] {
  return line.split('|').filter(c => c.trim()).map(cell => {
    const t = cell.trim()
    const left = t.startsWith(':')
    const right = t.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return 'default'
  })
}

export function parseLiveDocumentPlus(rawLines: string[]): LiveLine[] {
  const result: LiveLine[] = []
  const state = createState()

  // Pre-scan for alt-heading markers (=== and ---)
  const altHeadingLines = new Set<number>()
  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i].trim()
    if (/^={3,}$/.test(line) || /^-{3,}$/.test(line)) {
      const prev = rawLines[i - 1]?.trim()
      if (prev && prev.length > 0 && !prev.startsWith('#') && !prev.startsWith('>') && !prev.startsWith('-') && !prev.startsWith('|')) {
        altHeadingLines.add(i - 1) // the heading text line
        altHeadingLines.add(i)     // the === or --- marker
      }
    }
  }

  for (let li = 0; li < rawLines.length; li++) {
    const raw = rawLines[li]
    const trimmed = raw.trimStart()

    // --- Code fence toggle ---
    if (trimmed.startsWith('```')) {
      if (state.inCodeBlock) {
        state.inCodeBlock = false
        result.push({ raw, blockType: 'code-block-close', segments: [{ text: raw, kind: 'syntax' }] })
      } else {
        state.inCodeBlock = true
        result.push({
          raw, blockType: 'code-block-open',
          segments: [{ text: raw, kind: 'syntax' }],
          lang: trimmed.slice(3).trim() || undefined,
        })
      }
      continue
    }

    if (state.inCodeBlock) {
      result.push({ raw, blockType: 'code-block-line', segments: [{ text: raw, kind: 'code' }] })
      continue
    }

    // --- Math block $$ ---
    if (trimmed === '$$') {
      if (state.inMathBlock) {
        state.inMathBlock = false
        result.push({ raw, blockType: 'code-block-close', segments: [{ text: raw, kind: 'syntax' }], lang: 'math' })
      } else {
        state.inMathBlock = true
        result.push({ raw, blockType: 'code-block-open', segments: [{ text: raw, kind: 'syntax' }], lang: 'math' })
      }
      continue
    }
    if (state.inMathBlock) {
      result.push({ raw, blockType: 'code-block-line', segments: [{ text: raw, kind: 'code' }], lang: 'math' })
      continue
    }

    // --- Details blocks ---
    if (trimmed === '<details>' || trimmed.startsWith('<details ')) {
      result.push({ raw, blockType: 'details-open', segments: [{ text: raw, kind: 'html-tag' }] })
      continue
    }
    if (trimmed === '</details>') {
      result.push({ raw, blockType: 'details-close', segments: [{ text: raw, kind: 'html-tag' }] })
      continue
    }
    if (trimmed.startsWith('<summary>')) {
      const match = raw.match(/^(\s*<summary>)(.*?)(<\/summary>\s*)$/)
      if (match) {
        const segments: LiveSegment[] = [
          { text: match[1], kind: 'html-tag' },
        ]
        if (match[2]) segments.push({ text: match[2], kind: 'text' })
        segments.push({ text: match[3], kind: 'html-tag' })
        result.push({ raw, blockType: 'details-summary', segments })
      } else {
        result.push({ raw, blockType: 'details-summary', segments: [{ text: raw, kind: 'html-tag' }] })
      }
      continue
    }

    // --- HTML comment ---
    if (trimmed.startsWith('<!--')) {
      result.push({ raw, blockType: 'html-comment', segments: [{ text: raw, kind: 'syntax' }] })
      continue
    }

    // --- Table handling ---
    if (state.inTable) {
      if (trimmed.includes('|')) {
        if (isTableSeparator(raw)) {
          result.push({ raw, blockType: 'table-separator', segments: [{ text: raw, kind: 'syntax' }], tableAlignments: parseAlignments(raw) })
        } else {
          result.push({ raw, blockType: 'table-row', segments: parseTableCells(raw) })
        }
        continue
      } else {
        state.inTable = false
        // Fall through to normal parsing
      }
    }

    // Detect table start: a pipe-containing line followed by a separator line
    if (!state.inTable && trimmed.includes('|') && li + 1 < rawLines.length && isTableSeparator(rawLines[li + 1])) {
      state.inTable = true
      result.push({ raw, blockType: 'table-header', segments: parseTableCells(raw) })
      continue
    }

    // --- Empty ---
    if (raw.trim() === '') {
      result.push({ raw, blockType: 'empty', segments: [] })
      continue
    }

    // --- Horizontal rule ---
    if (/^(\s*[-*_]\s*){3,}$/.test(raw) && !altHeadingLines.has(li)) {
      result.push({ raw, blockType: 'horizontal-rule', segments: [{ text: raw, kind: 'syntax' }] })
      continue
    }

    // --- Alt heading (=== / ---) ---
    if (altHeadingLines.has(li)) {
      const marker = rawLines[li].trim()
      if (/^={3,}$/.test(marker) || /^-{3,}$/.test(marker)) {
        // This is the marker line
        result.push({ raw, blockType: 'alt-heading-marker', segments: [{ text: raw, kind: 'syntax' }] })
      } else {
        // This is the heading text
        const level = (rawLines[li + 1]?.trim().startsWith('=')) ? 1 : 2
        result.push({ raw, blockType: 'alt-heading', blockLevel: level, segments: parseLiveInlinePlus(raw) })
      }
      continue
    }

    // --- Heading ---
    const hm = raw.match(/^(#{1,6}\s+)(.*)$/)
    if (hm) {
      result.push({
        raw, blockType: 'heading', blockLevel: hm[1].trim().length,
        segments: [{ text: hm[1], kind: 'syntax' }, ...parseLiveInlinePlus(hm[2])],
      })
      continue
    }

    // --- Nested blockquote ---
    const bqMatch = raw.match(/^((>\s?)+)(.*)$/)
    if (bqMatch) {
      const prefix = bqMatch[1]
      const depth = (prefix.match(/>/g) || []).length
      const content = bqMatch[3]
      result.push({
        raw, blockType: 'blockquote', blockLevel: depth,
        segments: [{ text: prefix, kind: 'syntax' }, ...parseLiveInlinePlus(content)],
      })
      continue
    }

    // --- Task list ---
    const task = raw.match(/^(\s*[-*+]\s+\[)([ x])(\]\s+)(.*)$/)
    if (task) {
      result.push({
        raw, blockType: 'task-list',
        segments: [
          { text: task[1], kind: 'syntax' },
          { text: task[2], kind: 'task-checkbox' },
          { text: task[3], kind: 'syntax' },
          ...parseLiveInlinePlus(task[4]),
        ],
      })
      continue
    }

    // --- Unordered list ---
    const ul = raw.match(/^(\s*[-*+]\s+)(.*)$/)
    if (ul) {
      result.push({
        raw, blockType: 'unordered-list',
        blockLevel: Math.floor(ul[1].search(/\S/) / 2),
        segments: [{ text: ul[1], kind: 'syntax' }, ...parseLiveInlinePlus(ul[2])],
      })
      continue
    }

    // --- Ordered list ---
    const ol = raw.match(/^(\s*\d+\.\s+)(.*)$/)
    if (ol) {
      result.push({
        raw, blockType: 'ordered-list',
        blockLevel: Math.floor(ol[1].search(/\S/) / 2),
        segments: [{ text: ol[1], kind: 'syntax' }, ...parseLiveInlinePlus(ol[2])],
      })
      continue
    }

    // --- Footnote definition ---
    const fn = raw.match(/^(\[\^)([\w-]+)(\]:\s+)(.*)$/)
    if (fn) {
      result.push({
        raw, blockType: 'footnote-def',
        segments: [
          { text: fn[1], kind: 'syntax' },
          { text: fn[2], kind: 'footnote-label' },
          { text: fn[3], kind: 'syntax' },
          ...parseLiveInlinePlus(fn[4]),
        ],
      })
      continue
    }

    // --- Reference link definition ---
    const refDef = raw.match(/^(\[)([\w-]+)(\]:\s+)(.*)$/)
    if (refDef) {
      result.push({
        raw, blockType: 'paragraph',
        segments: [
          { text: refDef[1], kind: 'syntax' },
          { text: refDef[2], kind: 'ref-link-label' },
          { text: refDef[3], kind: 'syntax' },
          { text: refDef[4], kind: 'link-url' },
        ],
      })
      continue
    }

    // --- Paragraph ---
    result.push({ raw, blockType: 'paragraph', segments: parseLiveInlinePlus(raw) })
  }

  return result
}
