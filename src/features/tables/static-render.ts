// Static HTML table renderer for the tables feature.

import { parseLiveInlinePlus } from '../../parse-inline-plus.js'
import { createSegmentNodePlus } from '../../render-plus.js'
import type { LiveLine } from '../../types.js'
import { findTableBlockRange } from './line.js'
import { extractTableData } from './parse.js'
import type { TableModel, TableAlign } from './types.js'

export type { TableModel, TableAlign }

// ---------------------------------------------------------------------------
// Render static HTML table
// ---------------------------------------------------------------------------

const ALIGN_CLASS: Record<string, string> = {
  left: 'veloxmd-align-left',
  center: 'veloxmd-align-center',
  right: 'veloxmd-align-right',
  justify: 'veloxmd-align-left',
}

function appendInlineContent(cell: HTMLElement, markdown: string) {
  const segments = parseLiveInlinePlus(markdown).filter(segment => segment.kind !== 'syntax')
  if (segments.length === 0) {
    cell.textContent = markdown
    return
  }

  for (const segment of segments) {
    cell.appendChild(createSegmentNodePlus(segment))
  }
}

/** Create a rendered <table> element from TableModel */
export function renderStaticTable(data: TableModel): HTMLTableElement {
  const table = document.createElement('table')
  table.className = 'veloxmd-table'

  // <thead>
  const thead = document.createElement('thead')
  const headerRow = document.createElement('tr')
  for (let c = 0; c < data.headers.length; c++) {
    const th = document.createElement('th')
    appendInlineContent(th, data.headers[c] || '')
    const align = data.colAligns[c] || 'left'
    if (ALIGN_CLASS[align]) th.className = ALIGN_CLASS[align]
    headerRow.appendChild(th)
  }
  thead.appendChild(headerRow)
  table.appendChild(thead)

  // <tbody>
  const tbody = document.createElement('tbody')
  for (const row of data.rows) {
    const tr = document.createElement('tr')
    for (let c = 0; c < data.headers.length; c++) {
      const td = document.createElement('td')
      appendInlineContent(td, row[c] || '')
      const align = data.colAligns[c] || 'left'
      if (ALIGN_CLASS[align]) td.className = ALIGN_CLASS[align]
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)

  return table
}

export interface StaticTableBlock {
  element: HTMLTableElement
  end: number
}

/** Render the complete table block beginning at `start`, if present. */
export function renderStaticTableBlockAt(lines: LiveLine[], start: number): StaticTableBlock | null {
  if (lines[start]?.blockType !== 'table-header') return null
  const range = findTableBlockRange(lines, start)
  if (!range || range[0] !== start) return null

  const model = extractTableData(lines.slice(range[0], range[1]))
  if (model.headers.length === 0) return null
  return { element: renderStaticTable(model), end: range[1] }
}
