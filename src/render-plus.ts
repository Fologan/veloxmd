// =============================================================================
// Extended Renderer — handles plus segment kinds and block types
// =============================================================================

import type { LiveSegment, LiveLine } from './types.js'
import { createSegmentNode, renderLineElement } from './render.js'

export function createSegmentNodePlus(seg: LiveSegment): Node {
  switch (seg.kind) {
    case 'task-checkbox': {
      const el = document.createElement('span')
      el.className = seg.text === 'x' ? 'live-checkbox live-checked' : 'live-checkbox'
      el.textContent = seg.text
      return el
    }
    case 'autolink': {
      const el = document.createElement('span')
      el.className = 'live-autolink'
      el.textContent = seg.text
      return el
    }
    case 'footnote-ref': {
      const el = document.createElement('sup')
      el.className = 'live-footnote-ref'
      el.textContent = seg.text
      return el
    }
    case 'footnote-label': {
      const el = document.createElement('span')
      el.className = 'live-footnote-label'
      el.textContent = seg.text
      return el
    }
    case 'ref-link-text': {
      const el = document.createElement('span')
      el.className = 'live-link-text'
      el.textContent = seg.text
      return el
    }
    case 'ref-link-label': {
      const el = document.createElement('span')
      el.className = 'live-ref-label'
      el.textContent = seg.text
      return el
    }
    case 'link-title': {
      const el = document.createElement('span')
      el.className = 'live-link-title'
      el.textContent = seg.text
      return el
    }
    case 'html-tag': {
      const el = document.createElement('span')
      el.className = 'live-html-tag'
      el.textContent = seg.text
      return el
    }
    case 'highlight': {
      const el = document.createElement('mark')
      el.textContent = seg.text
      return el
    }
    case 'keyboard': {
      const el = document.createElement('kbd')
      el.textContent = seg.text
      return el
    }
    case 'underline': {
      const el = document.createElement('u')
      el.textContent = seg.text
      return el
    }
    case 'superscript': {
      const el = document.createElement('sup')
      el.textContent = seg.text
      return el
    }
    case 'subscript': {
      const el = document.createElement('sub')
      el.textContent = seg.text
      return el
    }
    case 'math-inline': {
      const el = document.createElement('span')
      el.className = 'live-math'
      el.textContent = seg.text
      return el
    }
    case 'hard-break': {
      const el = document.createElement('span')
      el.className = 'live-hard-break'
      el.textContent = seg.text
      return el
    }
    case 'image-alt': {
      const el = document.createElement('span')
      el.className = 'live-image-alt'
      el.textContent = seg.text
      return el
    }
    case 'image-url': {
      const el = document.createElement('span')
      el.className = 'live-link-url'
      el.textContent = seg.text
      return el
    }
    default:
      return createSegmentNode(seg)
  }
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
    case 'details-line':
      div.classList.add('live-details-line')
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
