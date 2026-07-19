// =============================================================================
// LiveViewer — static read-only render, zero runtime overhead
// =============================================================================

import type { LiveLine } from './types.js'
import { parseLiveDocumentPlus } from './parse-block-plus.js'
import { renderLineElementPlus } from './render-plus.js'
import { renderStaticTableBlockAt } from './features/tables/index.js'
import { VisualBlockController } from './features/visual-blocks/index.js'

export type ViewerOptions = {
  parser?: (lines: string[]) => LiveLine[]
  onChange?: (text: string) => void
}

export class LiveViewer {
  private root: HTMLDivElement
  private parseDoc: (lines: string[]) => LiveLine[]
  private lines: string[] = ['']
  private changeCallback: ((text: string) => void) | null = null
  private visualBlocks = new VisualBlockController()

  constructor(
    container: HTMLElement,
    parserOrOptions?: ((lines: string[]) => LiveLine[]) | ViewerOptions,
  ) {
    this.root = document.createElement('div')
    this.root.className = 'live-editor live-static'
    container.appendChild(this.root)
    if (typeof parserOrOptions === 'function') {
      this.parseDoc = parserOrOptions
    } else {
      this.parseDoc = parserOrOptions?.parser ?? parseLiveDocumentPlus
      this.changeCallback = parserOrOptions?.onChange ?? null
    }
  }

  setValue(text: string): void {
    this.lines = text.replace(/\r\n?/g, '\n').split('\n')
    this.render()
  }

  getValue(): string {
    return this.lines.join('\n')
  }

  private render(): void {
    this.visualBlocks.destroy()
    const parsed = this.parseDoc(this.lines)
    const frag = document.createDocumentFragment()

    let detailsEl: HTMLDetailsElement | null = null
    let summaryEl: HTMLElement | null = null

    for (let i = 0; i < parsed.length; i++) {
      const line = parsed[i]

      const tableBlock = renderStaticTableBlockAt(parsed, i)
      if (tableBlock) {
        if (detailsEl && summaryEl) detailsEl.appendChild(tableBlock.element)
        else frag.appendChild(tableBlock.element)
        i = tableBlock.end - 1
        continue
      }

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

    // Flush any trailing details
    if (detailsEl) frag.appendChild(detailsEl)

    this.root.innerHTML = ''
    this.root.appendChild(frag)
    this.visualBlocks.sync(
      this.root,
      this.lines,
      'static',
      (start, end, replacement) => {
        this.lines = [
          ...this.lines.slice(0, start),
          ...replacement,
          ...this.lines.slice(end),
        ]
        this.render()
        this.changeCallback?.(this.getValue())
      },
    )
  }

  destroy(): void {
    this.visualBlocks.destroy()
    this.root.remove()
  }
}
