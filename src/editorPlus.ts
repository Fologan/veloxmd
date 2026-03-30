// =============================================================================
// LiveEditorPlus — extends LiveEditor with all markdown features
// =============================================================================

import { LiveEditor } from './editor.js'
import type { LiveLine, LiveSegment } from './types.js'
import { parseLiveDocumentPlus } from './parse-block-plus.js'
import { createSegmentNodePlus, renderLineElementPlus } from './render-plus.js'

export class LiveEditorPlus extends LiveEditor {

  // Track which details blocks are expanded (by summary line data-line)
  private expandedDetails = new Set<string>()

  protected override parseDocument(rawLines: string[]): LiveLine[] {
    return parseLiveDocumentPlus(rawLines)
  }

  protected override createNode(seg: LiveSegment): Node {
    return createSegmentNodePlus(seg)
  }

  protected override renderLine(line: LiveLine, index: number): HTMLElement {
    return renderLineElementPlus(line, index)
  }

  protected override renderAll(): void {
    super.renderAll()
    this.setupDetailsBlocks()
  }

  private setupDetailsBlocks(): void {
    const allLines = Array.from(this.root.querySelectorAll('.live-line')) as HTMLElement[]
    let i = 0

    while (i < allLines.length) {
      const line = allLines[i]

      // Find <details> open
      if (line.classList.contains('live-details-fence') && line.textContent?.trim().startsWith('<details')) {
        const openLine = line
        let summaryLine: HTMLElement | null = null
        let closeLine: HTMLElement | null = null
        const contentLines: HTMLElement[] = []

        // Scan forward for summary, content, and close
        let j = i + 1
        while (j < allLines.length) {
          const cur = allLines[j]
          if (cur.classList.contains('live-details-summary') && !summaryLine) {
            summaryLine = cur
          } else if (cur.classList.contains('live-details-fence') && cur.textContent?.trim() === '</details>') {
            closeLine = cur
            break
          } else if (summaryLine) {
            contentLines.push(cur)
          }
          j++
        }

        if (summaryLine && closeLine) {
          const key = summaryLine.dataset.line || String(i)
          const isExpanded = this.expandedDetails.has(key)

          // Add toggle indicator to summary line
          const toggle = document.createElement('span')
          toggle.contentEditable = 'false'
          toggle.className = 'live-details-toggle'
          toggle.textContent = isExpanded ? '▼ ' : '▶ '
          summaryLine.insertBefore(toggle, summaryLine.firstChild)

          // Apply collapsed/expanded state to content lines
          for (const cl of contentLines) {
            cl.classList.add('live-details-content')
            if (!isExpanded) {
              cl.style.display = 'none'
            }
          }

          // Also hide/show close fence when collapsed
          if (!isExpanded) {
            closeLine.style.display = 'none'
          }

          // Click handler on toggle indicator
          const savedKey = key
          const savedContentLines = contentLines
          const savedCloseLine = closeLine
          toggle.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (this.expandedDetails.has(savedKey)) {
              this.expandedDetails.delete(savedKey)
              toggle.textContent = '▶ '
              for (const cl of savedContentLines) cl.style.display = 'none'
              savedCloseLine.style.display = 'none'
            } else {
              this.expandedDetails.add(savedKey)
              toggle.textContent = '▼ '
              for (const cl of savedContentLines) cl.style.display = ''
              savedCloseLine.style.display = ''
            }
          })

          i = j + 1
          continue
        }
      }

      i++
    }
  }
}
