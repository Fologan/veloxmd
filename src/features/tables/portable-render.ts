import { getTableCellAlign } from './model.js'
import { TABLE_BORDERS, type PortableTableRenderResult, type TableBorderKey, type TableModel } from './types.js'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const MARK_RE = /\p{Mark}/u
const EMOJI_RE = /\p{Extended_Pictographic}/u
const REGIONAL_RE = /[\u{1F1E6}-\u{1F1FF}]/u
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u
const WIDE_RE = /[\u1100-\u115F\u2329\u232A\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]|[\u{1F000}-\u{1FAFF}]|[\u{20000}-\u{3FFFD}]/u
const BIDI_CONTROL_RE = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g
const CELL_CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export function portableGraphemes(text: string): string[] {
  return Array.from(segmenter.segment(String(text || '')), item => item.segment)
}

export function normalizeTableCell(value: unknown): string {
  return String(value == null ? '' : value)
    .normalize('NFC')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(CELL_CONTROL_RE, '')
    .replace(BIDI_CONTROL_RE, '')
}

export function codePointCellWidth(character: string): number {
  const codePoint = character.codePointAt(0)
  if (codePoint == null) return 0
  if (codePoint <= 0x1F || (codePoint >= 0x7F && codePoint <= 0x9F)) return 0
  if (MARK_RE.test(character)) return 0
  if (codePoint === 0x200B || codePoint === 0x200C || codePoint === 0x200D || codePoint === 0x2060) return 0
  if ((codePoint >= 0xFE00 && codePoint <= 0xFE0F) || (codePoint >= 0xE0100 && codePoint <= 0xE01EF)) return 0
  if (WIDE_RE.test(character)) return 2
  return 1
}

export function graphemeCellWidth(grapheme: string): number {
  if (!grapheme) return 0
  if (EMOJI_RE.test(grapheme) || REGIONAL_RE.test(grapheme)) return 2
  let width = 0
  for (const character of grapheme) width += codePointCellWidth(character)
  return width
}

export function portableCellWidth(value: unknown): number {
  let width = 0
  for (const grapheme of portableGraphemes(normalizeTableCell(value))) width += graphemeCellWidth(grapheme)
  return width
}

function distribute(text: string, extraSpaces: number): string {
  if (extraSpaces <= 0) return text
  const hasWordSpaces = text.includes(' ')
  const parts = hasWordSpaces ? text.split(' ') : portableGraphemes(text)
  if (parts.length < 2) return text
  const slots = parts.length - 1
  const base = Math.floor(extraSpaces / slots)
  const remainder = extraSpaces % slots
  let output = parts[0]
  for (let index = 1; index < parts.length; index++) {
    output += ' '.repeat((hasWordSpaces ? 1 : 0) + base + (index <= remainder ? 1 : 0))
    output += parts[index]
  }
  return output
}

function isolateRTL(text: string): string {
  return RTL_RE.test(text) ? `\u2068${text}\u2069` : text
}

export function formatPortableTableCell(value: unknown, capacity: number, alignment: string): string {
  const source = normalizeTableCell(value)
  const width = portableCellWidth(source)
  const gap = Math.max(0, capacity - width)
  if (alignment === 'right') return ' '.repeat(gap) + isolateRTL(source)
  if (alignment === 'center') {
    const left = Math.ceil(gap / 2)
    return ' '.repeat(left) + isolateRTL(source) + ' '.repeat(gap - left)
  }
  if (alignment === 'justify') {
    const body = distribute(source, gap)
    return isolateRTL(body) + ' '.repeat(Math.max(0, capacity - portableCellWidth(body)))
  }
  return isolateRTL(source) + ' '.repeat(gap)
}

export function renderPortableTable(
  table: TableModel,
  options: { borderKey?: TableBorderKey | string } = {},
): PortableTableRenderResult {
  const headers = Array.isArray(table.headers) ? table.headers.map(normalizeTableCell) : []
  const rows = Array.isArray(table.rows) ? table.rows : []
  const columnCount = headers.length
  if (!columnCount) {
    return { text: '', colW: [], format: 'portable-cell-v1', unicodeProfile: 'wcwidth-grapheme-v1' }
  }

  const borderKey: TableBorderKey = options.borderKey && options.borderKey in TABLE_BORDERS
    ? options.borderKey as TableBorderKey
    : 'markdown'
  const border = TABLE_BORDERS[borderKey]
  const isMarkdown = borderKey === 'markdown'
  const colW = new Array<number>(columnCount).fill(3)
  for (let column = 0; column < columnCount; column++) {
    colW[column] = Math.max(colW[column], portableCellWidth(headers[column]))
  }
  for (const row of rows) {
    for (let column = 0; column < columnCount; column++) {
      colW[column] = Math.max(colW[column], portableCellWidth(row[column] ?? ''))
    }
  }
  for (let column = 0; column < columnCount; column++) {
    if (table.colAligns[column] === 'justify') colW[column] = Math.max(colW[column], 5)
  }

  const horizontalRule = (position: 'top' | 'mid' | 'bot'): string => {
    const [left, middle, right] = position === 'top'
      ? [border.tl, border.tc, border.tr]
      : position === 'mid'
        ? [border.ml, border.mc, border.mr]
        : [border.bl, border.bc, border.br]
    const fill = position === 'top' ? border.t : position === 'mid' ? border.m : border.b
    return left + colW.map(width => fill.repeat(width + 2)).join(middle) + right
  }

  const markdownRule = (): string => {
    let line = '|'
    for (let column = 0; column < columnCount; column++) {
      const width = colW[column] + 2
      const alignment = table.colAligns[column] ?? 'left'
      if (alignment === 'justify') line += '::' + '-'.repeat(Math.max(0, width - 4)) + '::'
      else if (alignment === 'center') line += ':' + '-'.repeat(width - 2) + ':'
      else if (alignment === 'right') line += '-'.repeat(width - 1) + ':'
      else line += ':' + '-'.repeat(width - 1)
      line += '|'
    }
    return line
  }

  const buildRow = (cells: string[], rowIndex: number): string => {
    let line = border.v
    for (let column = 0; column < columnCount; column++) {
      line += ` ${formatPortableTableCell(cells[column] ?? '', colW[column], getTableCellAlign(table, rowIndex, column))} ${border.v}`
    }
    return line
  }

  const lines: string[] = []
  if (border.wrap) lines.push(horizontalRule('top'))
  lines.push(buildRow(headers, -1))
  lines.push(isMarkdown ? markdownRule() : horizontalRule('mid'))
  for (let row = 0; row < rows.length; row++) lines.push(buildRow(rows[row], row))
  if (border.wrap) lines.push(horizontalRule('bot'))

  return {
    text: lines.join('\n'),
    colW,
    format: 'portable-cell-v1',
    unicodeProfile: 'wcwidth-grapheme-v1',
  }
}

export function wrapPortableTableCodeBlock(text: string, language = 'text'): string {
  const source = String(text || '')
  let fence = '```'
  while (source.includes(fence)) fence += '`'
  return `${fence}${language}\n${source}\n${fence}`
}
