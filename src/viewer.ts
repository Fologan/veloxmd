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
    for (let i = 0; i < parsed.length; i++) {
      frag.appendChild(renderLineElementPlus(parsed[i], i))
    }
    this.root.innerHTML = ''
    this.root.appendChild(frag)
  }

  destroy(): void {
    this.root.remove()
  }
}
