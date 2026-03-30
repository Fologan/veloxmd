// =============================================================================
// Base Renderer — segment → DOM node, line → div element
// =============================================================================

import type { LiveSegment, LiveLine } from './types.js'

export function createSegmentNode(seg: LiveSegment): Node {
  switch (seg.kind) {
    case 'syntax': {
      const s = document.createElement('span')
      s.className = 'syntax'
      s.textContent = seg.text
      return s
    }
    case 'bold': {
      const el = document.createElement('strong')
      el.textContent = seg.text
      return el
    }
    case 'italic': {
      const el = document.createElement('em')
      el.textContent = seg.text
      return el
    }
    case 'bold-italic': {
      const el = document.createElement('strong')
      const em = document.createElement('em')
      em.textContent = seg.text
      el.appendChild(em)
      return el
    }
    case 'code': {
      const el = document.createElement('code')
      el.textContent = seg.text
      return el
    }
    case 'strikethrough': {
      const el = document.createElement('del')
      el.textContent = seg.text
      return el
    }
    case 'link-text': {
      const el = document.createElement('span')
      el.className = 'live-link-text'
      el.textContent = seg.text
      return el
    }
    case 'link-url': {
      const el = document.createElement('span')
      el.className = 'live-link-url'
      el.textContent = seg.text
      return el
    }
    default:
      return document.createTextNode(seg.text)
  }
}

export function renderLineElement(line: LiveLine, index: number, nodeFactory?: (seg: LiveSegment) => Node): HTMLElement {
  const div = document.createElement('div')
  div.className = 'live-line'
  div.dataset.line = String(index)

  switch (line.blockType) {
    case 'heading': div.classList.add(`live-h${line.blockLevel}`); break
    case 'blockquote': div.classList.add('live-blockquote'); break
    case 'code-block-open':
    case 'code-block-close': div.classList.add('live-code-fence'); break
    case 'code-block-line': div.classList.add('live-code-line'); break
    case 'horizontal-rule': div.classList.add('live-hr'); break
    case 'unordered-list': div.classList.add('live-ul'); break
    case 'ordered-list': div.classList.add('live-ol'); break
  }

  if (line.segments.length === 0) {
    div.appendChild(document.createElement('br'))
    return div
  }

  const create = nodeFactory ?? createSegmentNode
  for (const seg of line.segments) div.appendChild(create(seg))
  return div
}
