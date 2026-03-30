// =============================================================================
// Base Block Parser — line-by-line with code block state tracking
// =============================================================================

import type { LiveLine } from './types.js'
import { parseLiveInline } from './parse-inline.js'

export function parseLiveDocument(rawLines: string[]): LiveLine[] {
  const result: LiveLine[] = []
  let inCodeBlock = false

  for (const raw of rawLines) {
    const trimmed = raw.trimStart()

    // Code fence toggle
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false
        result.push({ raw, blockType: 'code-block-close', segments: [{ text: raw, kind: 'syntax' }] })
      } else {
        inCodeBlock = true
        result.push({
          raw, blockType: 'code-block-open',
          segments: [{ text: raw, kind: 'syntax' }],
          lang: trimmed.slice(3).trim() || undefined,
        })
      }
      continue
    }

    if (inCodeBlock) {
      result.push({ raw, blockType: 'code-block-line', segments: [{ text: raw, kind: 'code' }] })
      continue
    }

    // Empty
    if (raw.trim() === '') {
      result.push({ raw, blockType: 'empty', segments: [] })
      continue
    }

    // Horizontal rule
    if (/^(\s*[-*_]\s*){3,}$/.test(raw)) {
      result.push({ raw, blockType: 'horizontal-rule', segments: [{ text: raw, kind: 'syntax' }] })
      continue
    }

    // Heading
    const hm = raw.match(/^(#{1,6}\s+)(.*)$/)
    if (hm) {
      result.push({
        raw, blockType: 'heading', blockLevel: hm[1].trim().length,
        segments: [{ text: hm[1], kind: 'syntax' }, ...parseLiveInline(hm[2])],
      })
      continue
    }

    // Blockquote
    const bq = raw.match(/^(>\s?)(.*)$/)
    if (bq) {
      result.push({
        raw, blockType: 'blockquote',
        segments: [{ text: bq[1], kind: 'syntax' }, ...parseLiveInline(bq[2])],
      })
      continue
    }

    // Unordered list
    const ul = raw.match(/^(\s*[-*+]\s+)(.*)$/)
    if (ul) {
      result.push({
        raw, blockType: 'unordered-list',
        blockLevel: Math.floor(ul[1].search(/\S/) / 2),
        segments: [{ text: ul[1], kind: 'syntax' }, ...parseLiveInline(ul[2])],
      })
      continue
    }

    // Ordered list
    const ol = raw.match(/^(\s*\d+\.\s+)(.*)$/)
    if (ol) {
      result.push({
        raw, blockType: 'ordered-list',
        blockLevel: Math.floor(ol[1].search(/\S/) / 2),
        segments: [{ text: ol[1], kind: 'syntax' }, ...parseLiveInline(ol[2])],
      })
      continue
    }

    // Paragraph
    result.push({ raw, blockType: 'paragraph', segments: parseLiveInline(raw) })
  }

  return result
}
