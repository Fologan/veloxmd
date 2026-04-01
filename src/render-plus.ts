// =============================================================================
// Extended Renderer — handles plus segment kinds and block types
// =============================================================================

import type { LiveSegment, LiveLine } from './types.js'
import { createSegmentNode, renderLineElement } from './render.js'

/** Segment kinds that map to a simple <span class="..."> */
const SPAN_CLASS: Record<string, string> = {
  'autolink': 'live-autolink',
  'footnote-label': 'live-footnote-label',
  'ref-link-text': 'live-link-text',
  'ref-link-label': 'live-ref-label',
  'link-title': 'live-link-title',
  'html-tag': 'live-html-tag syntax',
  'math-inline': 'live-math',
  'hard-break': 'live-hard-break',
  'image-alt': 'live-image-alt',
  'image-url': 'live-link-url',
}

/** Segment kinds that map to a semantic HTML element */
const ELEMENT_KIND: Record<string, { tag: string; className?: string }> = {
  'footnote-ref': { tag: 'sup', className: 'live-footnote-ref' },
  'highlight': { tag: 'mark' },
  'keyboard': { tag: 'kbd' },
  'underline': { tag: 'u' },
  'superscript': { tag: 'sup' },
  'subscript': { tag: 'sub' },
}

export function createSegmentNodePlus(seg: LiveSegment): Node {
  // Simple span cases
  const spanCls = SPAN_CLASS[seg.kind]
  if (spanCls) {
    const el = document.createElement('span')
    el.className = spanCls
    el.textContent = seg.text
    return el
  }

  // Semantic element cases
  const elemDef = ELEMENT_KIND[seg.kind]
  if (elemDef) {
    const el = document.createElement(elemDef.tag)
    if (elemDef.className) el.className = elemDef.className
    el.textContent = seg.text
    return el
  }

  // Special: task checkbox has conditional class
  if (seg.kind === 'task-checkbox') {
    const el = document.createElement('span')
    el.className = seg.text === 'x' ? 'live-checkbox live-checked' : 'live-checkbox'
    el.textContent = seg.text
    return el
  }

  return createSegmentNode(seg)
}

export function renderLineElementPlus(line: LiveLine, index: number): HTMLElement {
  const div = renderLineElement(line, index, createSegmentNodePlus)

  // Add plus-specific CSS classes
  switch (line.blockType) {
    case 'table-header':
      div.classList.add('live-table-header')
      break
    case 'table-separator':
      div.classList.add('live-table-separator')
      break
    case 'table-row':
      div.classList.add('live-table-row')
      break
    case 'task-list':
      div.classList.add('live-task')
      break
    case 'alt-heading':
      div.classList.add(`live-h${line.blockLevel}`)
      break
    case 'alt-heading-marker':
      div.classList.add('live-alt-heading-marker')
      break
    case 'footnote-def':
      div.classList.add('live-footnote-def')
      break
    case 'html-comment':
      div.classList.add('live-comment')
      break
    case 'details-open':
    case 'details-close':
      div.classList.add('live-details-fence')
      break
    case 'details-summary':
      div.classList.add('live-details-summary')
      break
  }

  // Nested blockquote depth
  if (line.blockType === 'blockquote' && line.blockLevel && line.blockLevel > 1) {
    div.dataset.depth = String(line.blockLevel)
  }

  // Image preview — add inline <img> preview for image URLs
  const imageUrl = line.segments.find(s => s.kind === 'image-url')
  if (imageUrl) {
    const wrap = document.createElement('span')
    wrap.contentEditable = 'false'
    wrap.className = 'live-image-preview-wrap'
    const img = document.createElement('img')
    img.src = imageUrl.text
    img.className = 'live-image-preview'
    img.alt = line.segments.find(s => s.kind === 'image-alt')?.text || ''
    img.loading = 'lazy'
    img.onerror = () => { wrap.style.display = 'none' }
    wrap.appendChild(img)
    div.appendChild(wrap)
  }

  return div
}
