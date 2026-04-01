// =============================================================================
// LiveViewer — static read-only render, zero runtime overhead
// =============================================================================

import type { LiveLine } from './types.js'
import { parseLiveDocumentPlus } from './parse-block-plus.js'
import { renderLineElementPlus } from './render-plus.js'
import { extractTableData, renderStaticTable } from './table-render.js'

const TABLE_BLOCK_TYPES = new Set(['table-header', 'table-separator', 'table-row'])

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
    let tableLines: LiveLine[] = []

    const flushTable = () => {
      if (tableLines.length === 0) return
      const data = extractTableData(tableLines)
      if (data.headers.length > 0) {
        const table = renderStaticTable(data)
        if (detailsEl && summaryEl) {
          detailsEl.appendChild(table)
        } else {
          frag.appendChild(table)
        }
      }
      tableLines = []
    }

    for (let i = 0; i < parsed.length; i++) {
      const line = parsed[i]

      // --- Table accumulation ---
      if (TABLE_BLOCK_TYPES.has(line.blockType)) {
        tableLines.push(line)
        continue
      }
      // Flush accumulated table lines when we hit a non-table line
      flushTable()

      // --- Details blocks ---
      if (line.blockType === 'details-open') {
        detailsEl = document.createElement('details')
        detailsEl.className = 'live-viewer-details'
        continue
      }

      if (line.blockType === 'details-summary' && detailsEl) {
        summaryEl = document.createElement('summary')
        summaryEl.className = 'live-viewer-summary'
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

      // --- Default line rendering ---
      const el = renderLineElementPlus(line, i)
      if (detailsEl && summaryEl) {
        detailsEl.appendChild(el)
      } else {
        frag.appendChild(el)
      }
    }

    // Flush any trailing table/details
    flushTable()
    if (detailsEl) frag.appendChild(detailsEl)

    this.root.innerHTML = ''
    this.root.appendChild(frag)
  }

  destroy(): void {
    this.root.remove()
  }
}
