// =============================================================================
// LiveEditorPlus — extends LiveEditor with all markdown features
// =============================================================================

import { LiveEditor } from './editor.js'
import type { LiveLine, LiveSegment } from './types.js'
import { parseLiveDocumentPlus } from './parse-block-plus.js'
import { createSegmentNodePlus, renderLineElementPlus } from './render-plus.js'
import {
  extractTableData,
  isTableHeaderBlock,
  portableTableTextForSelection,
  setupHybridTableOverlays,
  TableEditController,
  type TableAction,
} from './features/tables/index.js'
import { VisualBlockController } from './features/visual-blocks/index.js'

export class LiveEditorPlus extends LiveEditor {

  // Track which details blocks are expanded (by summary line data-line)
  private expandedDetails = new Set<string>()
  private tableEdit: TableEditController | null = null
  private visualBlocks: VisualBlockController | null = null

  override destroy(): void {
    this.visualBlocks?.destroy()
    this.tableEdit?.destroy()
    super.destroy()
  }

  private getVisualBlocks(): VisualBlockController {
    if (!this.visualBlocks) this.visualBlocks = new VisualBlockController()
    return this.visualBlocks
  }

  private setupVisualBlocks(): void {
    if (this.viewMode !== 'hybrid') return
    this.runWithMutationSyncSuppressed(() => {
      this.getVisualBlocks().sync(
        this.root,
        this.lines,
        'hybrid',
        (start, end, replacement) => this.replaceLineRange(start, end, replacement),
      )
    })
  }

  private getTableEdit(): TableEditController {
    if (!this.tableEdit) {
      this.tableEdit = new TableEditController(this.wrapper)
      this.tableEdit.onAction((action) => this.handleTableAction(action))
      this.tableEdit.onNeedRerender((newLines) => this.applyTableLines(newLines))
      this.root.addEventListener('beforeinput', () => {
        if (this.tableEdit?.isActive()) this.tableEdit.snap(this.root)
      })
    }
    return this.tableEdit
  }

  protected override parseDocument(rawLines: string[]): LiveLine[] {
    return parseLiveDocumentPlus(rawLines)
  }

  protected override createNode(seg: LiveSegment): Node {
    return createSegmentNodePlus(seg, {
      citationMode: this.viewMode === 'source' ? 'raw' : 'badge',
    })
  }

  protected override renderLine(line: LiveLine, index: number): HTMLElement {
    return renderLineElementPlus(line, index, {
      citationMode: this.viewMode === 'source' ? 'raw' : 'badge',
    })
  }

  protected override onKeyDown(e: KeyboardEvent): void {
    if (this.tableEdit?.isActive()) {
      if (e.key === 'Tab') {
        e.preventDefault()
        const range = this.tableEdit.navigateTab(e.shiftKey)
        if (range) this._restoreCursorRange(range.start, range.end)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const newLines = this.tableEdit.insertRowBelow()
        if (newLines) this.applyTableLines(newLines)
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); this.root.blur(); return }
    }
    super.onKeyDown(e)
  }

  protected override onInput(): void {
    if (this.tableEdit?.isActive() && this.tableEdit.hasPendingSnap()) {
      const pos = this.tableEdit.handleInput(this.root)
      if (pos) {
        // Update internal lines to match the DOM
        this.readLines()
        this.restoreCursor(pos)
      }
      return
    }
    super.onInput()
  }

  private handleTableAction(action: TableAction): void {
    if (!this.tableEdit?.isActive()) return
    const newLines = this.tableEdit.executeAction(action)
    if (newLines) this.applyTableLines(newLines)
  }

  private applyTableLines(newLines: string[]): void {
    if (!this.tableEdit?.getBlockRange()) return
    const [start, end] = this.tableEdit.getBlockRange()!
    const before = this.lines.slice(0, start)
    const after = this.lines.slice(end)
    this.lines = [...before, ...newLines, ...after]
    this.renderAll()
    // Re-activate the controller with updated block range
    const newEnd = start + newLines.length
    this.focusedBlockRange = [start, newEnd]
    this.tableEdit.activate(this.root, [start, newEnd], extractTableData(parseLiveDocumentPlus(newLines)))
  }

  protected override renderAll(): void {
    this.visualBlocks?.destroy()
    super.renderAll()
    this.setupDetailsBlocks()
    if (this.viewMode === 'hybrid') {
      this.setupTableBlocks()
      this.setupVisualBlocks()
    }
  }

  protected override onIncrementalRender(startIdx: number, endIdx: number): void {
    this.setupDetailsBlocksInRange(startIdx, endIdx)
    if (this.viewMode === 'hybrid') {
      this.setupTableBlocksInRange(startIdx, endIdx)
      this.setupVisualBlocks()
    }
  }

  protected override onBlockFocusChange(oldRange: [number, number] | null, newRange: [number, number] | null): void {
    this.setupVisualBlocks()
    const parsed = parseLiveDocumentPlus(this.lines)
    // Table edit controller — activate/deactivate on any mode
    if (newRange) {
      if (isTableHeaderBlock(parsed[newRange[0]]?.blockType)) {
        this.getTableEdit().activate(this.root, newRange, extractTableData(parsed.slice(newRange[0], newRange[1])))
      } else {
        this.tableEdit?.deactivate()
      }
    } else {
      this.tableEdit?.deactivate()
    }

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

    if (isTableHeaderBlock(parsed[oldRange[0]]?.blockType)) {
      this.setupTableBlocksInRange(oldRange[0], oldRange[1])
    }
  }

  protected override transformCopiedText(text: string): string {
    const portable = portableTableTextForSelection(text, parseLiveDocumentPlus)
    if (portable === null) return text
    return this.tableEdit?.getPortableText() ?? portable
  }

  refreshTableFontMetrics(): boolean {
    return this.tableEdit?.refreshFontMetrics() ?? false
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
    this.setupTableBlocksInRange(0, this.lines.length)
  }

  private setupTableBlocksInRange(startIdx: number, endIdx: number): void {
    setupHybridTableOverlays({
      root: this.root,
      parsedLines: parseLiveDocumentPlus(this.lines),
      scanStart: startIdx,
      scanEnd: endIdx,
      onActivate: () => this.onSelectionChange(),
    })
  }
}
