import type { LiveLine } from '../../types.js'
import { extractTableData } from './parse.js'
import { findTableBlockRange } from './line.js'
import { renderStaticTable } from './static-render.js'

export interface TableOverlayOptions {
  root: HTMLElement
  parsedLines: LiveLine[]
  scanStart?: number
  scanEnd?: number
  onActivate?: (startLine: number, endLine: number) => void
}

function lineElement(root: HTMLElement, line: number): HTMLElement | null {
  return root.querySelector(`[data-line="${line}"]`) as HTMLElement | null
}

function focusFirstTextNode(element: HTMLElement): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const textNode = walker.nextNode()
  if (!textNode) return

  const range = document.createRange()
  range.setStart(textNode, 0)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Mount static HTML overlays for unfocused tables in hybrid mode. */
export function setupHybridTableOverlays(options: TableOverlayOptions): void {
  const { root, parsedLines, onActivate } = options
  if (parsedLines.length === 0) return

  let scanStart = Math.max(0, options.scanStart ?? 0)
  let scanEnd = Math.min(parsedLines.length, options.scanEnd ?? parsedLines.length)

  const startRange = findTableBlockRange(parsedLines, scanStart)
  if (startRange) scanStart = startRange[0]
  const endRange = findTableBlockRange(parsedLines, Math.max(scanStart, scanEnd - 1))
  if (endRange) scanEnd = endRange[1]

  let lineIndex = scanStart
  while (lineIndex < scanEnd) {
    if (parsedLines[lineIndex]?.blockType !== 'table-header') {
      lineIndex++
      continue
    }

    const blockRange = findTableBlockRange(parsedLines, lineIndex)
    if (!blockRange || blockRange[0] !== lineIndex) {
      lineIndex++
      continue
    }

    const [start, end] = blockRange
    const blockLines: HTMLElement[] = []
    for (let current = start; current < end; current++) {
      const element = lineElement(root, current)
      if (element) blockLines.push(element)
    }

    const previous = root.querySelector(
      `.veloxmd-table-overlay[data-table-start="${start}"]`,
    ) as HTMLElement | null
    previous?.remove()

    if (blockLines.length === end - start && !blockLines.some(element => element.classList.contains('focused'))) {
      const model = extractTableData(parsedLines.slice(start, end))
      if (model.headers.length > 0) {
        const table = renderStaticTable(model)
        table.contentEditable = 'false'
        table.classList.add('veloxmd-table-overlay')
        table.dataset.tableStart = String(start)

        table.addEventListener('mousedown', event => {
          event.preventDefault()
          event.stopPropagation()
          for (const element of blockLines) element.style.display = ''
          table.remove()
          const firstLine = lineElement(root, start)
          if (!firstLine) return
          focusFirstTextNode(firstLine)
          onActivate?.(start, end)
        })

        for (const element of blockLines) element.style.display = 'none'
        blockLines[0].parentNode?.insertBefore(table, blockLines[0])
      }
    }

    lineIndex = end
  }
}
