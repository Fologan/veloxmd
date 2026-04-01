// =============================================================================
// LiveViewer — static read-only render, zero runtime overhead
// =============================================================================

import type { LiveLine } from './types.js'
import { parseLiveDocumentPlus } from './parse-block-plus.js'
import { renderLineElementPlus } from './render-plus.js'

export class LiveViewer {
  private root: HTMLDivElement
  private parseDoc: (lines: string[]) => LiveLine[]

  constructor(container: HTMLElement, parser?: (lines: string[]) => LiveLine[]) {
    this.root = document.createElement('div')
    this.root.className = 'live-editor live-static'
    container.appendChild(this.root)
    this.parseDoc = parser ?? parseLiveDocumentPlus
  }

  setValue(text: string): void {
    const parsed = this.parseDoc(text.split('\n'))
    const frag = document.createDocumentFragment()

    let detailsEl: HTMLDetailsElement | null = null
    let summaryEl: HTMLElement | null = null

    for (let i = 0; i < parsed.length; i++) {
      const line = parsed[i]

      if (line.blockType === 'details-open') {
        detailsEl = document.createElement('details')
        detailsEl.className = 'live-viewer-details'
        continue
      }

      if (line.blockType === 'details-summary' && detailsEl) {
        summaryEl = document.createElement('summary')
        summaryEl.className = 'live-viewer-summary'
        // Extract just the text content between <summary> and </summary>
        const summaryText = line.raw.replace(/<\/?summary>/g, '').trim()
        summaryEl.textContent = summaryText
        detailsEl.appendChild(summaryEl)
        continue
      }

      if (line.blockType === 'details-close' && detailsEl) {
        frag.appendChild(detailsEl)
        detailsEl = null
        summaryEl = null
        continue
      }

      const el = renderLineElementPlus(line, i)
      if (detailsEl && summaryEl) {
        detailsEl.appendChild(el)
      } else {
        frag.appendChild(el)
      }
    }

    // If a details block was never closed, append what we have
    if (detailsEl) frag.appendChild(detailsEl)

    this.root.innerHTML = ''
    this.root.appendChild(frag)
  }

  destroy(): void {
    this.root.remove()
  }
}
