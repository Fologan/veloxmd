// table-render.ts — Bridge between LiveLine parser and table engine

import type { LiveLine } from './types.js'
import { createTableModel } from './table-engine.js'
import type { TableModel, TableAlign } from './table-engine.js'

export type { TableModel, TableAlign }

// ---------------------------------------------------------------------------
// Extract table data from parsed LiveLines
// ---------------------------------------------------------------------------

/** Extract raw cell text from a markdown table line */
function extractCells(raw: string): string[] {
  const trimmed = raw.trim()
  const withoutEdgePipes = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed
  const content = withoutEdgePipes.endsWith('|')
    ? withoutEdgePipes.slice(0, -1)
    : withoutEdgePipes
  return content.split('|').map(c => c.trim())
}

/** Extract TableModel from a contiguous block of table LiveLines */
export function extractTableData(lines: LiveLine[]): TableModel {
  let headers: string[] = []
  let rawAligns: ('left' | 'center' | 'right' | 'default')[] = []
  const rows: string[][] = []

  for (const line of lines) {
    switch (line.blockType) {
      case 'table-header':
        headers = extractCells(line.raw)
        break
      case 'table-separator':
        rawAligns = line.tableAlignments ?? headers.map(() => 'default' as const)
        break
      case 'table-row':
        rows.push(extractCells(line.raw))
        break
    }
  }

  // Map 'default' → 'left'
  const colAligns: TableAlign[] = rawAligns.map(a => a === 'default' ? 'left' : a)

  const model = createTableModel(headers, colAligns)

  // Normalize row lengths to match header count and add to model
  const colCount = headers.length
  for (const row of rows) {
    while (row.length < colCount) row.push('')
    if (row.length > colCount) row.length = colCount
    model.rows.push(row)
  }

  return model
}

// ---------------------------------------------------------------------------
// Render static HTML table
// ---------------------------------------------------------------------------

const ALIGN_CLASS: Record<string, string> = {
  left: 'veloxmd-align-left',
  center: 'veloxmd-align-center',
  right: 'veloxmd-align-right',
  justify: 'veloxmd-align-left',
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
    th.textContent = data.headers[c]
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
      td.textContent = row[c] || ''
      const align = data.colAligns[c] || 'left'
      if (ALIGN_CLASS[align]) td.className = ALIGN_CLASS[align]
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)

  return table
}
