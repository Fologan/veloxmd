import { describe, expect, it } from 'vitest'
import {
  normalizeTableCell,
  parseLiveDocumentPlus,
  portableCellWidth,
  portableTableCode,
  portableTableTextForSelection,
  renderPortableTable,
  type TableBorderKey,
  type TableModel,
} from '../src/index'

const mixedTable: TableModel = {
  headers: ['City', 'Country', 'Population', 'Language'],
  rows: [
    ['東京', '日本', '13960000', '日本語'],
    ['서울', '한국', '9776000', '한국어'],
    ['北京', '中国', '21540000', '中文'],
    ['Bangkok', 'ไทย', '10539000', 'ภาษาไทย'],
    ['Mumbai', 'भारत', '20411000', 'हिन्दी'],
    ['القاهرة', 'مصر', '10100000', 'العربية'],
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

function linePosts(line: string, borderKey: TableBorderKey): number[] {
  const posts: number[] = []
  let column = 0
  for (const item of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(line)) {
    if (postCharacters(borderKey).has(item.segment)) posts.push(column)
    column += portableCellWidth(item.segment)
  }
  return posts
}

describe('portable Unicode table rendering', () => {
  for (const borderKey of ['markdown', 'box', 'double', 'ascii'] as const) {
    it(`uses equal post positions and no tabs for ${borderKey}`, () => {
      const result = renderPortableTable(mixedTable, { borderKey })
      const expected = [0]
      let column = 0
      for (const width of result.colW) {
        column += width + 3
        expected.push(column)
      }
      expect(result.format).toBe('portable-cell-v1')
      expect(result.unicodeProfile).toBe('wcwidth-grapheme-v1')
      expect(result.text).not.toContain('\t')
      expect(result.text).not.toContain('\r')
      for (const [lineIndex, line] of result.text.split('\n').entries()) {
        expect(linePosts(line, borderKey), `line ${lineIndex + 1}`).toEqual(expected)
      }
    })
  }

  it('covers Latin, CJK, Korean, Devanagari, Thai, emoji and combining marks', () => {
    expect(portableCellWidth('ASCII')).toBe(5)
    expect(portableCellWidth('東京')).toBe(4)
    expect(portableCellWidth('서울')).toBe(4)
    expect(portableCellWidth('👨‍👩‍👧')).toBe(2)
    expect(portableCellWidth('e\u0301')).toBe(1)
    expect(portableCellWidth('भारत')).toBe(3)
    expect(portableCellWidth('हिन्दी')).toBe(3)
    expect(portableCellWidth('ภาษาไทย')).toBe(7)
    expect(normalizeTableCell('A\tB\nC\u0007')).toBe('A B C')
  })

  it('isolates RTL text without moving the table posts', () => {
    const result = renderPortableTable(mixedTable, { borderKey: 'markdown' })
    expect(result.text).toMatch(/\u2068العربية\u2069/u)
    for (const line of result.text.split('\n')) {
      expect(linePosts(line, 'markdown')).toEqual([0, 10, 20, 33, 44])
    }
  })

  it('respects left, right, center and justify', () => {
    const result = renderPortableTable({
      headers: ['Reference'],
      rows: [['L'], ['$9.99'], ['MID'], ['$4.99']],
      colAligns: ['left'],
      rowAligns: { 0: 'left', 1: 'right', 2: 'center', 3: 'justify' },
    }, { borderKey: 'markdown' })
    const inner = [2, 3, 4, 5].map(index => result.text.split('\n')[index].slice(2, -2))
    expect(inner[0].startsWith('L')).toBe(true)
    expect(inner[1].endsWith('$9.99')).toBe(true)
    expect(inner[2].indexOf('MID')).toBe(Math.ceil((result.colW[0] - 3) / 2))
    expect(inner[3].startsWith('$')).toBe(true)
    expect(inner[3].endsWith('9')).toBe(true)
    const justifiedColumn = renderPortableTable({
      headers: ['A'], rows: [['B']], colAligns: ['justify'], rowAligns: {},
    }, { borderKey: 'markdown' })
    expect(justifiedColumn.text.split('\n')[1]).toMatch(/^\|::-{3,}::\|$/)
  })

  it('uses portable output for complete-table selection and Copy Code', () => {
    const liveSelection = '| City\t| Country |\n| :--- | ---: |\n| 東京\t| 日本 |'
    const portable = portableTableTextForSelection(liveSelection, parseLiveDocumentPlus)
    expect(portable).not.toBeNull()
    expect(portable).not.toContain('\t')
    expect(portableTableTextForSelection(`before\n${liveSelection}`, parseLiveDocumentPlus)).toBeNull()
    const code = portableTableCode(mixedTable)
    expect(code.startsWith('```text\n')).toBe(true)
    expect(code.endsWith('\n```')).toBe(true)
    expect(code).not.toContain('\t')
  })
})
