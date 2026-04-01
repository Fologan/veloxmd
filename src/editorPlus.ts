// =============================================================================
// LiveEditorPlus — extends LiveEditor with all markdown features
// =============================================================================

import { LiveEditor } from './editor.js'
import type { LiveLine, LiveSegment } from './types.js'
import { parseLiveDocumentPlus } from './parse-block-plus.js'
import { createSegmentNodePlus, renderLineElementPlus } from './render-plus.js'
import { extractTableData, renderStaticTable } from './table-render.js'
import type { TableModel } from './table-engine.js'

const TABLE_LINE_CLASSES = new Set(['live-table-header', 'live-table-row', 'live-table-separator'])

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
    if (this.viewMode === 'hybrid') this.setupTableBlocks()
  }

  protected override onIncrementalRender(startIdx: number, endIdx: number): void {
    this.setupDetailsBlocksInRange(startIdx, endIdx)
    if (this.viewMode === 'hybrid') this.setupTableBlocksInRange(startIdx, endIdx)
  }

  protected override onBlockFocusChange(oldRange: [number, number] | null, newRange: [number, number] | null): void {
    if (this.viewMode !== 'hybrid') return

    // When a details block gains focus, reveal all lines as source
    if (newRange) {
      const newFirst = this.root.querySelector(`[data-line="${newRange[0]}"]`) as HTMLElement | null
      if (newFirst?.classList.contains('live-details-fence')) {
        for (let dl = newRange[0]; dl < newRange[1]; dl++) {
          const el = this.root.querySelector(`[data-line="${dl}"]`) as HTMLElement | null
          if (el) {
            el.style.display = ''
            el.classList.remove('live-details-content')
            // Remove toggle spans
            el.querySelectorAll('.live-details-toggle').forEach(t => t.remove())
          }
        }
      }
    }

    if (!oldRange) return

    const firstLine = this.root.querySelector(`[data-line="${oldRange[0]}"]`) as HTMLElement | null
    if (!firstLine) return

    // Re-apply details block styling when leaving a details block
    if (firstLine.classList.contains('live-details-fence')) {
      this.setupDetailsBlocksInRange(oldRange[0], oldRange[1])
      return
    }

    // Check if the old block was a table block — find its lines and re-overlay
    if (!firstLine.classList.contains('live-table-header')) return

    // Collect the table block lines by data-line
    const blockLines: HTMLElement[] = [firstLine]
    for (let dl = oldRange[0] + 1; dl < oldRange[1]; dl++) {
      const el = this.root.querySelector(`[data-line="${dl}"]`) as HTMLElement | null
      if (el && this.isTableLine(el)) blockLines.push(el)
    }

    // Re-create overlay since block just lost focus
    const tableData = this.extractTableFromDOM(blockLines)
    if (tableData.headers.length === 0) return

    const table = renderStaticTable(tableData)
    table.contentEditable = 'false'
    table.classList.add('fastmd-table-overlay')

    const startLine = oldRange[0]
    table.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      for (const bl of blockLines) bl.style.display = ''
      table.remove()
      const fl = this.root.querySelector(`[data-line="${startLine}"]`) as HTMLElement
      if (!fl) return
      const walker = document.createTreeWalker(fl, NodeFilter.SHOW_TEXT)
      const textNode = walker.nextNode()
      if (textNode) {
        const range = document.createRange()
        range.setStart(textNode, 0)
        range.collapse(true)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
      this.onSelectionChange()
    })

    for (const bl of blockLines) bl.style.display = 'none'
    firstLine.parentNode?.insertBefore(table, firstLine)
  }

  // ---------------------------------------------------------------------------
  // Details blocks
  // ---------------------------------------------------------------------------

  private setupDetailsBlocks(): void {
    const allLines = Array.from(this.root.querySelectorAll('.live-line')) as HTMLElement[]
    this.setupDetailsInElements(allLines, 0, allLines.length)
  }

  private setupDetailsBlocksInRange(startIdx: number, endIdx: number): void {
    const allLines = Array.from(this.root.querySelectorAll('.live-line')) as HTMLElement[]
    this.setupDetailsInElements(allLines, startIdx, endIdx)
  }

  private setupDetailsInElements(allLines: HTMLElement[], scanStart: number, scanEnd: number): void {
    const isHybrid = this.viewMode === 'hybrid'
    let i = scanStart

    while (i < scanEnd && i < allLines.length) {
      const line = allLines[i]

      if (line.classList.contains('live-details-fence') && line.textContent?.trim().startsWith('<details')) {
        let summaryLine: HTMLElement | null = null
        let closeLine: HTMLElement | null = null
        const contentLines: HTMLElement[] = []

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
          // In hybrid mode, if the block is focused, show everything as source
          const blockIsFocused = line.classList.contains('focused') ||
            summaryLine.classList.contains('focused') ||
            closeLine.classList.contains('focused') ||
            contentLines.some(cl => cl.classList.contains('focused'))

          const key = String(i)
          const isExpanded = this.expandedDetails.has(key)

          if (isHybrid && !blockIsFocused) {
            // Hide the opening <details> fence line in hybrid
            line.style.display = 'none'

            const toggle = document.createElement('span')
            toggle.contentEditable = 'false'
            toggle.className = 'live-details-toggle'
            toggle.textContent = isExpanded ? '▼ ' : '▶ '
            summaryLine.insertBefore(toggle, summaryLine.firstChild)

            for (const cl of contentLines) {
              cl.classList.add('live-details-content')
              if (!isExpanded) cl.style.display = 'none'
            }

            if (!isExpanded) closeLine.style.display = 'none'

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
          }

          i = j + 1
          continue
        }
      }

      i++
    }
  }

  // ---------------------------------------------------------------------------
  // Table blocks — render <table> overlay when unfocused in hybrid mode
  // ---------------------------------------------------------------------------

  private setupTableBlocks(): void {
    const allLines = Array.from(this.root.querySelectorAll('.live-line')) as HTMLElement[]
    this.setupTableInElements(allLines, 0, allLines.length)
  }

  private setupTableBlocksInRange(startIdx: number, endIdx: number): void {
    const allLines = Array.from(this.root.querySelectorAll('.live-line')) as HTMLElement[]
    this.setupTableInElements(allLines, startIdx, endIdx)
  }

  private isTableLine(el: HTMLElement): boolean {
    return TABLE_LINE_CLASSES.has(el.classList[1]) ||
      Array.from(TABLE_LINE_CLASSES).some(c => el.classList.contains(c))
  }

  private setupTableInElements(allLines: HTMLElement[], scanStart: number, scanEnd: number): void {
    let i = scanStart

    while (i < scanEnd && i < allLines.length) {
      const line = allLines[i]

      if (line.classList.contains('live-table-header')) {
        // Collect all lines in this table block
        const blockLines: HTMLElement[] = [line]
        let j = i + 1
        while (j < allLines.length && this.isTableLine(allLines[j])) {
          blockLines.push(allLines[j])
          j++
        }

        // Check if any line in the block is focused (being edited)
        const isFocused = blockLines.some(l => l.classList.contains('focused'))

        if (!isFocused) {
          // Extract table data from parsed lines
          const startLine = parseInt(line.dataset.line || '0')
          const tableData = this.extractTableFromDOM(blockLines)

          if (tableData.headers.length > 0) {
            const table = renderStaticTable(tableData)
            table.contentEditable = 'false'
            table.classList.add('fastmd-table-overlay')

            // Click on overlay → focus the block (reveals source)
            table.addEventListener('mousedown', (e) => {
              e.preventDefault()
              e.stopPropagation()
              // Show source lines, remove overlay
              for (const bl of blockLines) bl.style.display = ''
              table.remove()
              // Place cursor in the header line
              const firstLine = this.root.querySelector(`[data-line="${startLine}"]`) as HTMLElement
              if (!firstLine) return
              const walker = document.createTreeWalker(firstLine, NodeFilter.SHOW_TEXT)
              const textNode = walker.nextNode()
              if (textNode) {
                const range = document.createRange()
                range.setStart(textNode, 0)
                range.collapse(true)
                const sel = window.getSelection()
                sel?.removeAllRanges()
                sel?.addRange(range)
              }
              // Force selection change detection since the event may not fire
              this.onSelectionChange()
            })

            // Hide source lines, show table overlay
            for (const bl of blockLines) bl.style.display = 'none'
            const insertBefore = blockLines[0]
            insertBefore.parentNode?.insertBefore(table, insertBefore)
          }
        }

        i = j
        continue
      }

      i++
    }
  }

  /** Extract TableModel from DOM elements (reads raw text content) */
  private extractTableFromDOM(elements: HTMLElement[]): TableModel {
    const lines: LiveLine[] = []
    for (const el of elements) {
      const raw = el.textContent || ''
      let blockType = 'paragraph'
      if (el.classList.contains('live-table-header')) blockType = 'table-header'
      else if (el.classList.contains('live-table-separator')) blockType = 'table-separator'
      else if (el.classList.contains('live-table-row')) blockType = 'table-row'

      // Parse alignments from separator line
      let tableAlignments: ('left' | 'center' | 'right' | 'default')[] | undefined
      if (blockType === 'table-separator') {
        tableAlignments = raw.split('|').filter(c => c.trim()).map(cell => {
          const t = cell.trim()
          const left = t.startsWith(':')
          const right = t.endsWith(':')
          if (left && right) return 'center' as const
          if (right) return 'right' as const
          if (left) return 'left' as const
          return 'default' as const
        })
      }

      lines.push({ raw, blockType, segments: [], tableAlignments } as LiveLine)
    }
    return extractTableData(lines)
  }
}
