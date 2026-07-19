import { beforeAll, describe, expect, it } from 'vitest'
import {
  TABLE_TAB_SIZE,
  UnicodeWidthMeasurer,
  extractTableData,
  graphemeIdxToOffset,
  graphemeLen,
  graphemes,
  parseLiveDocumentPlus,
  renderTableText,
  type TableBorderKey,
  type TableModel,
} from '../src/index'

class FractionalCanvas {
  getContext() {
    const context = {
      font: '',
      measureText(text: string) {
        const wideFont = context.font.includes('Wide')
        let pixels = 0
        for (const character of String(text)) {
          const code = character.codePointAt(0) ?? 0
          if (character === ' ') pixels += 10
          else if (wideFont) pixels += 20
          else if (code >= 0x4E00 && code <= 0x9FFF) pixels += 19.5
          else if (code >= 0xAC00 && code <= 0xD7A3) pixels += 19.4
          else if (code >= 0x0900 && code <= 0x097F) pixels += 8.7
          else if (code >= 0x0E00 && code <= 0x0E7F) pixels += 9.2
          else if (code >= 0x0600 && code <= 0x06FF) pixels += 10.8
          else if (code >= 0x1F000) pixels += 20.2
          else pixels += 10
        }
        return { width: pixels }
      },
    }
    return context
  }
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'OffscreenCanvas', { value: FractionalCanvas, configurable: true })
})

const mixedTable: TableModel = {
  headers: ['City', 'Country', 'Population', 'Language'],
  rows: [
    ['東京', '日本', '13960000', '日本語'],
    ['서울', '한국', '9776000', '한국어'],
    ['北京', '中国', '21540000', '中文'],
    ['Bangkok', 'ไทย', '10539000', 'ภาษาไทย'],
    ['Mumbai', 'भारत', '20411000', 'हिन्दी'],
    ['القاهرة', 'مصر', '10100000', 'العربية'],
    ['台北', '臺灣', '2600000', '繁體中文'],
    ['Emoji', '👨‍👩‍👧', '3', 'e\u0301'],
  ],
  colAligns: ['left', 'left', 'right', 'left'],
  rowAligns: {},
}

function postCharacters(borderKey: TableBorderKey): Set<string> {
  if (borderKey === 'box') return new Set('┌┬┐├┼┤└┴┘│')
  if (borderKey === 'double') return new Set('╔╦╗╠╬╣╚╩╝║')
  if (borderKey === 'ascii') return new Set('+|')
  return new Set('|')
}

function postColumns(line: string, borderKey: TableBorderKey, measurer: UnicodeWidthMeasurer): number[] {
  const positions: number[] = []
  let column = 0
  for (const grapheme of graphemes(line)) {
    if (postCharacters(borderKey).has(grapheme)) positions.push(column)
    if (grapheme === '\t') column = Math.floor(column / TABLE_TAB_SIZE + 1) * TABLE_TAB_SIZE
    else {
      const width = measurer.displayWidth(grapheme)
      if (!Number.isFinite(width)) throw new Error(`Non-finite width for ${JSON.stringify(grapheme)}`)
      column += width
    }
  }
  return positions
}

function fallbackWidth(grapheme: string): number {
  let width = 0
  for (const character of grapheme) {
    const code = character.codePointAt(0) ?? 0
    if (character === ' ') width += 1
    else if (code >= 0x4E00 && code <= 0x9FFF) width += 1.99
    else if (code >= 0xAC00 && code <= 0xD7A3) width += 1.98
    else if (code >= 0x0900 && code <= 0x097F) width += 0.93
    else if (code >= 0x0E00 && code <= 0x0E7F) width += 0.97
    else if (code >= 0x0600 && code <= 0x06FF) width += 1.10
    else if (code >= 0x1F000) width += 2.02
    else width += 1
  }
  return width
}

function fallbackPostColumns(line: string, borderKey: TableBorderKey): number[] {
  const positions: number[] = []
  let column = 0
  for (const grapheme of graphemes(line)) {
    if (postCharacters(borderKey).has(grapheme)) positions.push(Math.round(column * 100) / 100)
    if (grapheme === '\t') column = Math.floor(column / TABLE_TAB_SIZE + 1) * TABLE_TAB_SIZE
    else column += fallbackWidth(grapheme)
  }
  return positions
}

describe('measured live table rendering', () => {
  for (const widthMode of ['measured', 'standard'] as const) {
    for (const borderKey of ['markdown', 'box', 'double', 'ascii'] as const) {
      it(`aligns every post for ${borderKey}/${widthMode}`, () => {
        const measurer = new UnicodeWidthMeasurer()
        measurer.configureFont('14px monospace')
        const result = renderTableText(mixedTable, borderKey, { measurer, widthMode })
        const expected = [0, ...result.anchors]
        for (const [lineIndex, line] of result.text.split('\n').entries()) {
          expect(postColumns(line, borderKey, measurer), `line ${lineIndex + 1}`).toEqual(expected)
          if (widthMode === 'measured') {
            expect(fallbackPostColumns(line, borderKey), `fallback line ${lineIndex + 1}`).toEqual(expected)
          }
          const isCellLine = result.cellMap.some(cell => cell.li === lineIndex)
          const expectedTabs = isCellLine ? result.colModes.filter(mode => mode === 'anchor').length : 0
          expect((line.match(/\t/g) ?? []).length).toBe(expectedTabs)
        }
        if (widthMode === 'standard') expect(result.colModes.every(mode => mode === 'spaces')).toBe(true)
      })
    }
  }

  it('round-trips the Markdown model through the canonical parser', () => {
    const measurer = new UnicodeWidthMeasurer()
    measurer.configureFont('14px monospace')
    const table = mixedTable
    const text = renderTableText(table, 'markdown', { measurer, widthMode: 'standard' }).text
    const parsed = extractTableData(parseLiveDocumentPlus(text.split('\n')))
    expect(parsed.headers).toEqual(table.headers)
    expect(parsed.rows).toEqual(table.rows)
    expect(parsed.colAligns).toEqual(table.colAligns)

    const justified = renderTableText({
      headers: ['A'], rows: [['B']], colAligns: ['justify'], rowAligns: {},
    }, 'markdown', { measurer, widthMode: 'standard' }).text
    expect(extractTableData(parseLiveDocumentPlus(justified.split('\n'))).colAligns).toEqual(['justify'])
  })

  it('keeps grapheme offsets for emoji and complex scripts', () => {
    expect(graphemeLen('👨‍👩‍👧')).toBe(1)
    expect(graphemeLen('हिन्दी')).toBe(2)
    expect(graphemeIdxToOffset('A👨‍👩‍👧B', 2)).toBe('A👨‍👩‍👧'.length)
  })

  it('grows Latin and CJK columns incrementally', () => {
    const measurer = new UnicodeWidthMeasurer()
    measurer.configureFont('14px monospace')
    const latinAnchors = Array.from({ length: 6 }, (_, index) => renderTableText({
      headers: ['A'], rows: [['x'.repeat(index + 4)]], colAligns: ['left'], rowAligns: {},
    }, 'markdown', { measurer }).anchors[0])
    for (let index = 1; index < latinAnchors.length; index++) {
      expect(latinAnchors[index] - latinAnchors[index - 1]).toBe(1)
    }

    const cjkAnchors = [6, 7, 8].map(length => renderTableText({
      headers: ['City'], rows: [['京'.repeat(length)]], colAligns: ['left'], rowAligns: {},
    }, 'markdown', { measurer }).anchors[0])
    expect(cjkAnchors[1] - cjkAnchors[0]).toBeLessThanOrEqual(2)
    expect(cjkAnchors[2] - cjkAnchors[1]).toBeLessThanOrEqual(2)
    const threshold = renderTableText({
      headers: ['City', 'Value'],
      rows: [['東京京京京京', 'six'], ['東京京京京京京', 'seven'], ['東京京京京京京京', 'eight']],
      colAligns: ['left', 'left'], rowAligns: {},
    }, 'markdown', { measurer })
    expect(threshold.colModes).toEqual(['anchor', 'spaces'])
  })

  it('uses the complete content box for all four alignments', () => {
    const measurer = new UnicodeWidthMeasurer()
    measurer.configureFont('14px monospace')
    const result = renderTableText({
      headers: ['Reference'],
      rows: [['L'], ['$9.99'], ['MID'], ['$4.99']],
      colAligns: ['left'],
      rowAligns: { 0: 'left', 1: 'right', 2: 'center', 3: 'justify' },
    }, 'markdown', { measurer })
    const lines = result.text.split('\n')
    const body = (row: number) => {
      const cell = result.cellMap.find(item => item.row === row)!
      return lines[cell.li].slice(cell.start, cell.end)
    }
    expect(body(0).startsWith('L')).toBe(true)
    expect(body(1).trimEnd().endsWith('$9.99')).toBe(true)
    expect(body(2).indexOf('MID')).toBeGreaterThan(0)
    expect(body(3).startsWith('$')).toBe(true)
    expect(body(3).trimEnd().endsWith('9')).toBe(true)
  })

  it('invalidates live measurements when the active editor font changes', () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const measurer = new UnicodeWidthMeasurer()
    element.style.font = '14px monospace'
    expect(measurer.configureFromElement(element, true)).toBe(true)
    const normal = renderTableText({ headers: ['A'], rows: [['xxxx']], colAligns: ['left'], rowAligns: {} }, 'markdown', { measurer }).anchors[0]

    element.style.fontFamily = 'Wide'
    expect(measurer.configureFromElement(element, true)).toBe(true)
    const wide = renderTableText({ headers: ['A'], rows: [['xxxx']], colAligns: ['left'], rowAligns: {} }, 'markdown', { measurer }).anchors[0]
    expect(wide).toBeGreaterThan(normal)
    expect(measurer.metrics().styleSignature).toContain('Wide')
    expect(measurer.metrics().backend).toBe('dom')
    measurer.destroy()
    element.remove()
  })
})
