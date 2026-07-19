import { getTableCell, getTableCellAlign } from './model.js'
import {
  defaultTableWidthMeasurer,
  graphemeIdxToOffset,
  offsetToGraphemeIdx,
  TABLE_TAB_SIZE,
  type UnicodeWidthMeasurer,
  type UnicodeWidthMode,
} from './unicode-width.js'
import { TABLE_BORDERS, type TableBorderKey, type TableCellPos, type TableModel, type TableRenderResult } from './types.js'

export const TABLE_GRID_EPSILON = 0.01

export type LiveTableRenderOptions = {
  measurer?: UnicodeWidthMeasurer
  tabSize?: number
  widthMode?: UnicodeWidthMode
}

function roundUpToTabStop(value: number, tabSize: number): number {
  return Math.max(tabSize, Math.ceil((value - TABLE_GRID_EPSILON) / tabSize) * tabSize)
}

function justify(text: string, extraSpaces: number): string {
  if (extraSpaces <= 0) return text
  const hasWordSpaces = text.includes(' ')
  const parts = hasWordSpaces
    ? text.split(' ')
    : Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), item => item.segment)
  if (parts.length < 2) return text
  const slots = parts.length - 1
  const base = Math.floor(extraSpaces / slots)
  const remainder = extraSpaces % slots
  let output = parts[0]
  for (let index = 1; index < parts.length; index++) {
    const originalSpace = hasWordSpaces ? 1 : 0
    output += ' '.repeat(originalSpace + base + (index <= remainder ? 1 : 0)) + parts[index]
  }
  return output
}

function prepareCell(text: string, capacity: number, alignment: string, measurer: UnicodeWidthMeasurer) {
  const source = String(text || '')
  const gap = Math.max(0, Math.round(capacity - measurer.displayWidth(source)))
  if (alignment === 'right') return { left: ' '.repeat(gap), body: source }
  if (alignment === 'center') return { left: ' '.repeat(Math.round(gap / 2)), body: source }
  if (alignment === 'justify') return { left: '', body: justify(source, gap) }
  return { left: '', body: source }
}

export function renderTableText(
  table: TableModel,
  borderKey: TableBorderKey | string = 'markdown',
  options: LiveTableRenderOptions = {},
): TableRenderResult {
  const startedAt = performance.now()
  const headers = Array.isArray(table.headers) ? table.headers : []
  const rows = Array.isArray(table.rows) ? table.rows : []
  const columnCount = headers.length
  if (!columnCount) {
    return { text: '', cellMap: [], colW: [], colSpans: [], colModes: [], anchors: [], ms: [0, 0] }
  }

  const measurer = options.measurer ?? defaultTableWidthMeasurer
  measurer.setMode(options.widthMode)
  measurer.resetMetrics()
  const tabSize = options.tabSize ?? TABLE_TAB_SIZE
  const safeBorderKey: TableBorderKey = borderKey in TABLE_BORDERS ? borderKey as TableBorderKey : 'markdown'
  const border = TABLE_BORDERS[safeBorderKey]
  const isMarkdown = safeBorderKey === 'markdown'

  const measuredWidths = new Array<number>(columnCount).fill(3)
  const gridSafe = new Array<boolean>(columnCount).fill(true)
  const observeWidth = (column: number, text: string) => {
    const width = measurer.displayWidth(text)
    measuredWidths[column] = Math.max(measuredWidths[column], width)
    if (Math.abs(width - Math.round(width)) > TABLE_GRID_EPSILON) gridSafe[column] = false
  }
  for (let column = 0; column < columnCount; column++) observeWidth(column, headers[column] ?? '')
  for (const row of rows) {
    for (let column = 0; column < columnCount; column++) observeWidth(column, row[column] ?? '')
  }
  for (let column = 0; column < columnCount; column++) {
    if (table.colAligns[column] === 'justify') measuredWidths[column] = Math.max(measuredWidths[column], 5)
  }

  const colModes: Array<'spaces' | 'anchor'> = gridSafe.map(safe => safe ? 'spaces' : 'anchor')
  const colSpans: number[] = []
  const anchors: number[] = []
  let accumulated = 0
  for (let column = 0; column < columnCount; column++) {
    const organicSpan = roundUpToTabStop(measuredWidths[column] + 3, 1)
    const desiredAnchor = accumulated + organicSpan
    const anchor = colModes[column] === 'anchor'
      ? roundUpToTabStop(desiredAnchor, tabSize)
      : desiredAnchor
    colSpans.push(anchor - accumulated)
    accumulated = anchor
    anchors.push(accumulated)
  }
  const colW = colSpans.map(span => span - 3)
  const measureMs = performance.now() - startedAt

  const layoutStartedAt = performance.now()
  const lines: string[] = []
  const cellMap: TableCellPos[] = []

  const horizontalRule = (position: 'top' | 'mid' | 'bot'): string => {
    const [left, middle, right] = position === 'top'
      ? [border.tl, border.tc, border.tr]
      : position === 'mid'
        ? [border.ml, border.mc, border.mr]
        : [border.bl, border.bc, border.br]
    const fill = position === 'top' ? border.t : position === 'mid' ? border.m : border.b
    return left + colSpans.map(span => fill.repeat(span - 1)).join(middle) + right
  }

  const markdownRule = (): string => {
    let line = '|'
    for (let column = 0; column < columnCount; column++) {
      const interior = colSpans[column] - 1
      const alignment = table.colAligns[column] ?? 'left'
      if (alignment === 'justify') line += '::' + '-'.repeat(Math.max(0, interior - 4)) + '::'
      else if (alignment === 'center') line += ':' + '-'.repeat(interior - 2) + ':'
      else if (alignment === 'right') line += '-'.repeat(interior - 1) + ':'
      else line += ':' + '-'.repeat(interior - 1)
      line += '|'
    }
    return line
  }

  const buildRow = (cells: string[], rowIndex: number): string => {
    const lineIndex = lines.length
    let line = border.v
    let previousAnchor = 0
    for (let column = 0; column < columnCount; column++) {
      const raw = String(cells[column] ?? '')
      const prepared = prepareCell(raw, colW[column], getTableCellAlign(table, rowIndex, column), measurer)
      line += ' '
      const cellStart = line.length
      line += prepared.left
      const textStart = line.length
      line += prepared.body
      const textEnd = line.length

      const currentVisualColumn = previousAnchor + 2 + measurer.displayWidth(prepared.left + prepared.body)
      const targetAnchor = anchors[column]
      if (colModes[column] === 'spaces') {
        line += ' '.repeat(Math.max(0, Math.round(targetAnchor - currentVisualColumn)))
      } else {
        const launchColumn = targetAnchor - (tabSize / 2)
        const launchPadding = Math.max(0, Math.round(launchColumn - currentVisualColumn))
        line += ' '.repeat(launchPadding) + '\t'
      }
      const cellEnd = Math.max(cellStart, line.length - 1)
      cellMap.push({
        row: rowIndex,
        col: column,
        li: lineIndex,
        start: cellStart,
        end: cellEnd,
        textStart,
        textEnd,
        w: colW[column],
        abs: 0,
        absEnd: 0,
        absTextStart: 0,
        absTextEnd: 0,
      })
      line += border.v
      previousAnchor = targetAnchor
    }
    return line
  }

  if (border.wrap) lines.push(horizontalRule('top'))
  lines.push(buildRow(headers, -1))
  lines.push(isMarkdown ? markdownRule() : horizontalRule('mid'))
  for (let row = 0; row < rows.length; row++) lines.push(buildRow(rows[row], row))
  if (border.wrap) lines.push(horizontalRule('bot'))

  const lineOffsets: number[] = []
  let absoluteOffset = 0
  for (const line of lines) {
    lineOffsets.push(absoluteOffset)
    absoluteOffset += line.length + 1
  }
  for (const cell of cellMap) {
    const lineOffset = lineOffsets[cell.li]
    cell.abs = lineOffset + cell.start
    cell.absEnd = lineOffset + cell.end
    cell.absTextStart = lineOffset + cell.textStart
    cell.absTextEnd = lineOffset + cell.textEnd
  }

  return {
    text: lines.join('\n'),
    cellMap,
    colW,
    colSpans,
    colModes,
    anchors,
    ms: [measureMs, performance.now() - layoutStartedAt],
  }
}

export function cursorToTableCell(
  table: TableModel,
  position: number,
  map: TableCellPos[],
): { row: number; col: number; gi: number } | null {
  for (const cell of map) {
    if (position < cell.abs || position > cell.absEnd) continue
    const text = getTableCell(table, cell.row, cell.col)
    if (position <= cell.absTextStart) return { row: cell.row, col: cell.col, gi: 0 }
    if (position >= cell.absTextEnd) return { row: cell.row, col: cell.col, gi: Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length }
    return {
      row: cell.row,
      col: cell.col,
      gi: offsetToGraphemeIdx(text, position - cell.absTextStart),
    }
  }
  return null
}

export function tableCellToCursor(
  table: TableModel,
  row: number,
  column: number,
  graphemeIndex: number,
  map: TableCellPos[],
): number {
  const cell = map.find(item => item.row === row && item.col === column)
  if (!cell) return 0
  return cell.absTextStart + graphemeIdxToOffset(getTableCell(table, row, column), graphemeIndex)
}

export function nearestTableCell(position: number, map: TableCellPos[]): TableCellPos | null {
  let best: TableCellPos | null = null
  let bestDistance = Infinity
  for (const cell of map) {
    const distance = Math.abs(position - ((cell.abs + cell.absEnd) / 2))
    if (distance < bestDistance) {
      bestDistance = distance
      best = cell
    }
  }
  return best
}

export { TABLE_BORDERS }
