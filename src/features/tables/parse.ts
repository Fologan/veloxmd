import { parseLiveInlinePlus } from '../../parse-inline-plus.js'
import type { LiveLine, LiveSegment } from '../../types.js'
import { createTableModel } from './model.js'
import type { TableAlign, TableModel } from './types.js'

export function parseTableCells(raw: string): LiveSegment[] {
  const segments: LiveSegment[] = []
  const cells = raw.split('|')
  for (let column = 0; column < cells.length; column++) {
    if (column > 0) segments.push({ text: '|', kind: 'syntax' })
    if (cells[column].length > 0) segments.push(...parseLiveInlinePlus(cells[column]))
  }
  return segments
}

export interface ParsedTableDocumentLine {
  inTable: boolean
  line: LiveLine | null
}

/** Parse one table line while the document parser retains block-order control. */
export function parseTableDocumentLine(
  raw: string,
  nextRaw: string | undefined,
  inTable: boolean,
): ParsedTableDocumentLine {
  const trimmed = raw.trimStart()

  if (inTable) {
    if (!trimmed.includes('|')) return { inTable: false, line: null }
    if (isTableSeparator(raw)) {
      return {
        inTable: true,
        line: {
          raw,
          blockType: 'table-separator',
          segments: [{ text: raw, kind: 'syntax' }],
          tableAlignments: parseTableAlignments(raw),
        },
      }
    }
    return {
      inTable: true,
      line: { raw, blockType: 'table-row', segments: parseTableCells(raw) },
    }
  }

  if (trimmed.includes('|') && nextRaw !== undefined && isTableSeparator(nextRaw)) {
    return {
      inTable: true,
      line: { raw, blockType: 'table-header', segments: parseTableCells(raw) },
    }
  }

  return { inTable: false, line: null }
}

export function isTableSeparator(line: string): boolean {
  return /^\|?[\s:]*-{3,}[\s:]*(\|[\s:]*-{3,}[\s:]*)*\|?\s*$/.test(line.trim())
}

export function parseTableAlignments(line: string): Array<TableAlign | 'default'> {
  return line.split('|').filter(cell => cell.trim()).map(cell => {
    const value = cell.trim()
    if (value.startsWith('::') && value.endsWith('::')) return 'justify'
    if (value.startsWith(':') && value.endsWith(':')) return 'center'
    if (value.endsWith(':')) return 'right'
    if (value.startsWith(':')) return 'left'
    return 'default'
  })
}

export function extractRawTableCells(raw: string): string[] {
  const trimmed = raw.trim()
  const withoutLeadingPipe = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed
  const content = withoutLeadingPipe.endsWith('|') ? withoutLeadingPipe.slice(0, -1) : withoutLeadingPipe
  return content.split('|').map(cell => cell.trim())
}

export function extractTableData(lines: LiveLine[]): TableModel {
  let headers: string[] = []
  let rawAligns: Array<TableAlign | 'default'> = []
  const rows: string[][] = []

  for (const line of lines) {
    if (line.blockType === 'table-header') headers = extractRawTableCells(line.raw)
    else if (line.blockType === 'table-separator') rawAligns = line.tableAlignments ?? headers.map(() => 'default')
    else if (line.blockType === 'table-row') rows.push(extractRawTableCells(line.raw))
  }

  const colAligns: TableAlign[] = headers.map((_, index) => {
    const alignment = rawAligns[index]
    return alignment && alignment !== 'default' ? alignment : 'left'
  })
  const model = createTableModel(headers, colAligns)
  for (const row of rows) {
    while (row.length < headers.length) row.push('')
    if (row.length > headers.length) row.length = headers.length
    model.rows.push(row)
  }
  return model
}

export function isCompleteTableSelection(lines: LiveLine[]): boolean {
  if (lines.length < 2) return false
  if (lines[0]?.blockType !== 'table-header' || lines[1]?.blockType !== 'table-separator') return false
  return lines.every(line => line.blockType === 'table-header'
    || line.blockType === 'table-separator'
    || line.blockType === 'table-row')
}
