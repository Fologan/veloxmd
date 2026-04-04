import { describe, it, expect, beforeAll } from 'vitest'
import {
  graphemeLen,
  graphemeIdxToOffset,
  initTableCanvas,
  createTableModel,
  getTableCell,
  setTableCell,
  getTableCellAlign,
  renderTableText,
  cursorToTableCell,
  tableCellToCursor,
  nearestTableCell,
  TABLE_BORDERS,
  type TableModel,
} from '../src/table-engine'

// ── Canvas mock ──────────────────────────────────────────────────────────────
// Must run before any code that calls graphemeWidth(), which lazily calls
// initTableCanvas("14px monospace") on first use.
beforeAll(() => {
  if (typeof OffscreenCanvas === 'undefined') {
    // happy-dom may not ship OffscreenCanvas — provide a minimal stub so that
    // initTableCanvas() doesn't throw and measureText returns predictable values.
    ;(globalThis as any).OffscreenCanvas = class {
      getContext() {
        return {
          font: '',
          // Each character is exactly 8.4 px wide so Math.round(w / 8.4) === 1
          measureText: (s: string) => ({ width: s.length * 8.4 }),
        }
      }
    }
  }
  initTableCanvas('14px monospace')
})

// ── 1. graphemeLen ───────────────────────────────────────────────────────────
describe('graphemeLen', () => {
  it('returns 0 for empty string', () => {
    expect(graphemeLen('')).toBe(0)
  })

  it('counts ASCII characters — each char is 1 grapheme', () => {
    expect(graphemeLen('hello')).toBe(5)
    expect(graphemeLen('abc')).toBe(3)
  })

  it('counts a single emoji as 1 grapheme', () => {
    // 🎉 is U+1F389, encoded as a UTF-16 surrogate pair (2 code units) but 1 grapheme
    expect(graphemeLen('🎉')).toBe(1)
  })

  it('counts multiple emoji as multiple graphemes', () => {
    expect(graphemeLen('🎉🎊')).toBe(2)
  })

  it('counts a multi-codepoint ZWJ emoji sequence as 1 grapheme', () => {
    // 👨‍👩‍👧 = man + ZWJ + woman + ZWJ + girl (family emoji)
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'
    expect(graphemeLen(family)).toBe(1)
  })

  it('counts a flag emoji (regional indicator pair) as 1 grapheme', () => {
    // 🇺🇸 = U+1F1FA + U+1F1F8 — two code points, one grapheme cluster
    expect(graphemeLen('🇺🇸')).toBe(1)
  })
})

// ── 2. graphemeIdxToOffset ───────────────────────────────────────────────────
describe('graphemeIdxToOffset', () => {
  it('returns 0 for grapheme index 0', () => {
    expect(graphemeIdxToOffset('hello', 0)).toBe(0)
  })

  it('returns correct offset for ASCII string', () => {
    // 'hello': gi=3 → offset 3 (one code unit per grapheme)
    expect(graphemeIdxToOffset('hello', 3)).toBe(3)
  })

  it('returns length of string when gi equals grapheme count', () => {
    expect(graphemeIdxToOffset('abc', 3)).toBe(3)
  })

  it('handles emoji: gi=1 past 🎉 → offset 2 (surrogate pair = 2 code units)', () => {
    // '🎉abc': 🎉 occupies code units 0-1, so gi=1 → offset 2
    expect(graphemeIdxToOffset('🎉abc', 1)).toBe(2)
  })

  it('handles mixed ASCII and emoji offsets', () => {
    // 'a🎉b': a=cu0, 🎉=cu1-2, b=cu3
    // gi=0 → 0, gi=1 → 1 (past 'a'), gi=2 → 3 (past '🎉'), gi=3 → 4 (past 'b')
    expect(graphemeIdxToOffset('a🎉b', 0)).toBe(0)
    expect(graphemeIdxToOffset('a🎉b', 1)).toBe(1)
    expect(graphemeIdxToOffset('a🎉b', 2)).toBe(3)
  })
})

// ── 3. createTableModel ──────────────────────────────────────────────────────
describe('createTableModel', () => {
  it('creates model with empty rows and rowAligns', () => {
    const t = createTableModel(['Name', 'Age'])
    expect(t.rows).toEqual([])
    expect(t.rowAligns).toEqual({})
  })

  it('copies the headers array (does not share reference)', () => {
    const headers = ['A', 'B']
    const t = createTableModel(headers)
    expect(t.headers).toEqual(['A', 'B'])
    // Mutation of original array must not affect the model
    headers.push('C')
    expect(t.headers).toHaveLength(2)
  })

  it('defaults all colAligns to left when not provided', () => {
    const t = createTableModel(['X', 'Y', 'Z'])
    expect(t.colAligns).toEqual(['left', 'left', 'left'])
  })

  it('uses provided colAligns', () => {
    const t = createTableModel(['A', 'B', 'C'], ['left', 'center', 'right'])
    expect(t.colAligns).toEqual(['left', 'center', 'right'])
  })

  it('fills missing colAligns with left when partial array is given', () => {
    // colAligns shorter than headers → remaining default to 'left'
    const t = createTableModel(['A', 'B', 'C'], ['right'])
    expect(t.colAligns[0]).toBe('right')
    expect(t.colAligns[1]).toBe('left')
    expect(t.colAligns[2]).toBe('left')
  })
})

// ── 4. getTableCell / setTableCell ──────────────────────────────────────────
describe('getTableCell / setTableCell', () => {
  it('reads header cell with row = -1', () => {
    const t = createTableModel(['Name', 'Age'])
    expect(getTableCell(t, -1, 0)).toBe('Name')
    expect(getTableCell(t, -1, 1)).toBe('Age')
  })

  it('reads data cell', () => {
    const t = createTableModel(['Name', 'Age'])
    t.rows.push(['Alice', '30'])
    expect(getTableCell(t, 0, 0)).toBe('Alice')
    expect(getTableCell(t, 0, 1)).toBe('30')
  })

  it('returns empty string for out-of-bounds column in header', () => {
    const t = createTableModel(['Name'])
    expect(getTableCell(t, -1, 99)).toBe('')
  })

  it('returns empty string for out-of-bounds row', () => {
    const t = createTableModel(['Name'])
    expect(getTableCell(t, 99, 0)).toBe('')
  })

  it('writes to header cell with row = -1', () => {
    const t = createTableModel(['Name', 'Age'])
    setTableCell(t, -1, 0, 'Full Name')
    expect(t.headers[0]).toBe('Full Name')
  })

  it('writes to data cell', () => {
    const t = createTableModel(['Name', 'Age'])
    t.rows.push(['Alice', '30'])
    setTableCell(t, 0, 1, '31')
    expect(t.rows[0][1]).toBe('31')
  })

  it('does not crash for out-of-bounds row write (row does not exist)', () => {
    const t = createTableModel(['Name'])
    // Row 5 does not exist — should be a no-op
    expect(() => setTableCell(t, 5, 0, 'x')).not.toThrow()
  })
})

// ── 5. getTableCellAlign ────────────────────────────────────────────────────
describe('getTableCellAlign', () => {
  it('returns colAlign when no row override is set', () => {
    const t = createTableModel(['A', 'B'], ['left', 'right'])
    expect(getTableCellAlign(t, 0, 0)).toBe('left')
    expect(getTableCellAlign(t, 0, 1)).toBe('right')
  })

  it('returns row override when one is set', () => {
    const t = createTableModel(['A', 'B'], ['left', 'left'])
    t.rowAligns[0] = 'center'
    // Row override applies to all columns in that row
    expect(getTableCellAlign(t, 0, 0)).toBe('center')
    expect(getTableCellAlign(t, 0, 1)).toBe('center')
  })

  it('row override -1 affects header row', () => {
    const t = createTableModel(['A'], ['left'])
    t.rowAligns[-1] = 'right'
    expect(getTableCellAlign(t, -1, 0)).toBe('right')
  })

  it('falls back to left when neither row nor col align is set', () => {
    const t: TableModel = { headers: ['A'], rows: [], colAligns: [], rowAligns: {} }
    expect(getTableCellAlign(t, 0, 0)).toBe('left')
  })
})

// ── 6. renderTableText ──────────────────────────────────────────────────────
describe('renderTableText', () => {
  // Build a simple 2-column, 1-row table for reuse across sub-tests.
  // headers: ['Name', 'Age'], rows: [['Alice', '30']]
  // colW: max(4,'Alice'=5,3)=5  for col 0
  //        max(3,'30'=2,3)=3    for col 1
  //
  // Line 0 (header):  "| Name  | Age |"        length 15
  // Line 1 (sep):     "|:------|:----|"         length 15
  // Line 2 (row 0):   "| Alice | 30  |"        length 15
  // Full text (lines joined with '\n')

  function makeSimpleTable() {
    const t = createTableModel(['Name', 'Age'])
    t.rows.push(['Alice', '30'])
    return t
  }

  it('returns empty result for table with no headers', () => {
    const t: TableModel = { headers: [], rows: [], colAligns: [], rowAligns: {} }
    const r = renderTableText(t)
    expect(r.text).toBe('')
    expect(r.cellMap).toEqual([])
    expect(r.colW).toEqual([])
  })

  it('computes colW correctly — minimum 3, max of header/row content', () => {
    const { colW } = renderTableText(makeSimpleTable())
    // 'Alice'=5 > 'Name'=4 > min 3  → 5
    // 'Age'=3  == min 3             → 3
    expect(colW).toEqual([5, 3])
  })

  it('produces correct markdown text with pipes and padding', () => {
    const { text } = renderTableText(makeSimpleTable())
    const lines = text.split('\n')
    expect(lines).toHaveLength(3)
    // Header line
    expect(lines[0]).toBe('| Name  | Age |')
    // Separator line — left align produces ":---" pattern
    expect(lines[1]).toBe('|:------|:----|')
    // Data row
    expect(lines[2]).toBe('| Alice | 30  |')
  })

  it('cellMap has 4 entries for a 2-col header + 1 data row', () => {
    const { cellMap } = renderTableText(makeSimpleTable())
    expect(cellMap).toHaveLength(4)
  })

  it('cellMap header cells have row = -1 and correct col', () => {
    const { cellMap } = renderTableText(makeSimpleTable())
    const hdr = cellMap.filter(c => c.row === -1)
    expect(hdr).toHaveLength(2)
    expect(hdr[0].col).toBe(0)
    expect(hdr[1].col).toBe(1)
  })

  it('cellMap data cells have row = 0 and correct col', () => {
    const { cellMap } = renderTableText(makeSimpleTable())
    const row0 = cellMap.filter(c => c.row === 0)
    expect(row0).toHaveLength(2)
    expect(row0[0].col).toBe(0)
    expect(row0[1].col).toBe(1)
  })

  it('cellMap header col-0: abs and absEnd match text content position', () => {
    // Line 0 starts at offset 0.
    // "| Name  | Age |"
    //  0123456789...
    // Cell content (padded, colW=5) starts after "| " at offset 2, ends at offset 7.
    const { cellMap } = renderTableText(makeSimpleTable())
    const h0 = cellMap.find(c => c.row === -1 && c.col === 0)!
    expect(h0.li).toBe(0)
    expect(h0.abs).toBe(2)
    expect(h0.absEnd).toBe(7) // abs + colW = 2 + 5
  })

  it('cellMap header col-1: abs and absEnd are correct', () => {
    // After "| Name  |" (9 chars), the next cell is " Age " inside the second "|…|".
    // start = length of "| Name  |" + 1 = 10, abs = 0 + 10 = 10, absEnd = 10 + 3 = 13
    const { cellMap } = renderTableText(makeSimpleTable())
    const h1 = cellMap.find(c => c.row === -1 && c.col === 1)!
    expect(h1.abs).toBe(10)
    expect(h1.absEnd).toBe(13)
  })

  it('cellMap data row cells: li = 2 (header=0, sep=1, row0=2)', () => {
    const { cellMap } = renderTableText(makeSimpleTable())
    const r0 = cellMap.filter(c => c.row === 0)
    expect(r0[0].li).toBe(2)
    expect(r0[1].li).toBe(2)
  })

  it('cellMap data col-0: abs accounts for two preceding lines', () => {
    // Line 0 length=15, line 1 length=15 → ls[2] = (15+1)+(15+1) = 32
    // start=2 → abs=32+2=34, absEnd=34+5=39
    const { cellMap } = renderTableText(makeSimpleTable())
    const r0c0 = cellMap.find(c => c.row === 0 && c.col === 0)!
    expect(r0c0.abs).toBe(34)
    expect(r0c0.absEnd).toBe(39)
  })

  it('cellMap data col-1: abs is correct', () => {
    // start=10 → abs=32+10=42, absEnd=42+3=45
    const { cellMap } = renderTableText(makeSimpleTable())
    const r0c1 = cellMap.find(c => c.row === 0 && c.col === 1)!
    expect(r0c1.abs).toBe(42)
    expect(r0c1.absEnd).toBe(45)
  })

  it('center-aligned column produces ":---:" separator', () => {
    const t = createTableModel(['X'], ['center'])
    t.rows.push(['hi'])
    const { text } = renderTableText(t)
    const sep = text.split('\n')[1]
    expect(sep).toMatch(/^|:.*:|$/)
  })

  it('right-aligned column produces "---:" separator', () => {
    const t = createTableModel(['X'], ['right'])
    t.rows.push(['hi'])
    const { text } = renderTableText(t)
    const sep = text.split('\n')[1]
    expect(sep).toMatch(/-+:/)
  })

  it('box border style includes top and bottom rule lines', () => {
    const t = createTableModel(['A', 'B'])
    t.rows.push(['x', 'y'])
    const { text } = renderTableText(t, 'box')
    const lines = text.split('\n')
    // box wraps: top rule + header + mid rule + data + bot rule = 5 lines
    expect(lines).toHaveLength(5)
    // First char of top rule is ┌
    expect(lines[0][0]).toBe('\u250c')
    // Last char of last line is ┘
    expect(lines[4][lines[4].length - 1]).toBe('\u2518')
  })

  it('ascii border style wraps with + corners', () => {
    const t = createTableModel(['A'])
    t.rows.push(['1'])
    const { text } = renderTableText(t, 'ascii')
    const lines = text.split('\n')
    expect(lines[0][0]).toBe('+')
    expect(lines[lines.length - 1][0]).toBe('+')
  })
})

// ── 7. cursorToTableCell ────────────────────────────────────────────────────
describe('cursorToTableCell', () => {
  function makeTable() {
    const t = createTableModel(['Name', 'Age'])
    t.rows.push(['Alice', '30'])
    return t
  }

  it('maps cursor inside header col-0 to row=-1, col=0', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // abs=2, absEnd=7 for header col-0 — cursor at abs+1 = 3
    const result = cursorToTableCell(t, 3, cellMap)
    expect(result).not.toBeNull()
    expect(result!.row).toBe(-1)
    expect(result!.col).toBe(0)
  })

  it('maps cursor at start of header col-0 to gi=0', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // abs=2 is the very start of the padded cell content; left-align → tStart=0
    const result = cursorToTableCell(t, 2, cellMap)
    expect(result!.gi).toBe(0)
  })

  it('maps cursor inside header col-1 to row=-1, col=1', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    const result = cursorToTableCell(t, 11, cellMap)
    expect(result).not.toBeNull()
    expect(result!.row).toBe(-1)
    expect(result!.col).toBe(1)
  })

  it('maps cursor inside data row col-0 to row=0, col=0', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // data col-0: abs=34, absEnd=39 — cursor at 35
    const result = cursorToTableCell(t, 35, cellMap)
    expect(result).not.toBeNull()
    expect(result!.row).toBe(0)
    expect(result!.col).toBe(0)
  })

  it('maps cursor inside data row col-1 to row=0, col=1', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    const result = cursorToTableCell(t, 43, cellMap)
    expect(result).not.toBeNull()
    expect(result!.row).toBe(0)
    expect(result!.col).toBe(1)
  })

  it('returns null for cursor on the separator line (between cells)', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // Separator is line 1, offset 16..30. No cell covers that range.
    const result = cursorToTableCell(t, 20, cellMap)
    expect(result).toBeNull()
  })

  it('gi does not exceed grapheme count of cell text', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // absEnd of header col-0 is 7 — cursor at absEnd should clamp to graphemeLen('Name')=4
    const result = cursorToTableCell(t, 7, cellMap)
    expect(result!.gi).toBeLessThanOrEqual(graphemeLen('Name'))
  })
})

// ── 8. tableCellToCursor ────────────────────────────────────────────────────
describe('tableCellToCursor', () => {
  function makeTable() {
    const t = createTableModel(['Name', 'Age'])
    t.rows.push(['Alice', '30'])
    return t
  }

  it('maps header col-0, gi=0 to abs start of that cell', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // header col-0 abs=2, left-align tStart=0 → cursor = 2 + 0 + displayWidth(''prefix to gi=0) = 2
    const pos = tableCellToCursor(t, -1, 0, 0, cellMap)
    expect(pos).toBe(2)
  })

  it('maps header col-0, gi=4 (end of "Name") to correct offset', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // left-align, tStart=0, displayWidth of 'Name' up to gi=4 = 4 → pos = 2 + 0 + 4 = 6
    const pos = tableCellToCursor(t, -1, 0, 4, cellMap)
    expect(pos).toBe(6)
  })

  it('maps data row-0 col-0, gi=0 to abs start of that cell', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // data col-0: abs=34, left-align tStart=0 → cursor = 34
    const pos = tableCellToCursor(t, 0, 0, 0, cellMap)
    expect(pos).toBe(34)
  })

  it('round-trip: cursorToTableCell → tableCellToCursor returns original position', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // Start with cursor at abs=35 (inside 'Alice', gi=1 since displayWidth('A')=1)
    const cell = cursorToTableCell(t, 35, cellMap)!
    expect(cell).not.toBeNull()
    const backPos = tableCellToCursor(t, cell.row, cell.col, cell.gi, cellMap)
    expect(backPos).toBe(35)
  })

  it('round-trip for header col-1', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    const cell = cursorToTableCell(t, 11, cellMap)!
    const backPos = tableCellToCursor(t, cell.row, cell.col, cell.gi, cellMap)
    expect(backPos).toBe(11)
  })

  it('returns 0 when cell is not found in map', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // Row 99 does not exist in the map
    const pos = tableCellToCursor(t, 99, 0, 0, cellMap)
    expect(pos).toBe(0)
  })
})

// ── 9. nearestTableCell ──────────────────────────────────────────────────────
describe('nearestTableCell', () => {
  function makeTable() {
    const t = createTableModel(['Name', 'Age'])
    t.rows.push(['Alice', '30'])
    return t
  }

  it('returns null for empty map', () => {
    expect(nearestTableCell(0, [])).toBeNull()
  })

  it('returns the only cell when map has one entry', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    const only = [cellMap[0]]
    expect(nearestTableCell(999, only)).toBe(cellMap[0])
  })

  it('picks header col-0 when cursor is near its centre', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // header col-0: abs=2, absEnd=7 → centre = 4.5
    const result = nearestTableCell(5, cellMap)
    expect(result!.row).toBe(-1)
    expect(result!.col).toBe(0)
  })

  it('picks header col-1 when cursor is near its centre', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // header col-1: abs=10, absEnd=13 → centre = 11.5
    const result = nearestTableCell(12, cellMap)
    expect(result!.row).toBe(-1)
    expect(result!.col).toBe(1)
  })

  it('picks data col-0 when cursor is within that row region', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // data col-0: abs=34, absEnd=39 → centre = 36.5
    const result = nearestTableCell(36, cellMap)
    expect(result!.row).toBe(0)
    expect(result!.col).toBe(0)
  })

  it('picks the cell whose centre is strictly closest when between cells', () => {
    const t = makeTable()
    const { cellMap } = renderTableText(t)
    // Cursor at offset 0 — closest centre is header col-0 (centre ≈ 4.5)
    const result = nearestTableCell(0, cellMap)
    expect(result!.row).toBe(-1)
    expect(result!.col).toBe(0)
  })
})

// ── 10. TABLE_BORDERS ───────────────────────────────────────────────────────
describe('TABLE_BORDERS', () => {
  const expectedKeys = ['tl', 't', 'tc', 'tr', 'ml', 'm', 'mc', 'mr', 'bl', 'b', 'bc', 'br', 'v', 'wrap']

  it('exports all 4 border styles', () => {
    expect(TABLE_BORDERS).toHaveProperty('markdown')
    expect(TABLE_BORDERS).toHaveProperty('box')
    expect(TABLE_BORDERS).toHaveProperty('double')
    expect(TABLE_BORDERS).toHaveProperty('ascii')
  })

  for (const style of ['markdown', 'box', 'double', 'ascii'] as const) {
    it(`${style} border has all required keys`, () => {
      const border = TABLE_BORDERS[style]
      for (const key of expectedKeys) {
        expect(border).toHaveProperty(key)
      }
    })
  }

  it('markdown border uses | as vertical separator', () => {
    expect(TABLE_BORDERS.markdown.v).toBe('|')
  })

  it('markdown border does not wrap (no top/bottom rule)', () => {
    expect(TABLE_BORDERS.markdown.wrap).toBe(false)
  })

  it('box border wraps with box-drawing characters', () => {
    expect(TABLE_BORDERS.box.wrap).toBe(true)
    expect(TABLE_BORDERS.box.tl).toBe('\u250c')
    expect(TABLE_BORDERS.box.br).toBe('\u2518')
  })

  it('double border wraps with double-line drawing characters', () => {
    expect(TABLE_BORDERS.double.wrap).toBe(true)
    expect(TABLE_BORDERS.double.tl).toBe('\u2554')
    expect(TABLE_BORDERS.double.br).toBe('\u255d')
  })

  it('ascii border uses + for corners', () => {
    expect(TABLE_BORDERS.ascii.tl).toBe('+')
    expect(TABLE_BORDERS.ascii.br).toBe('+')
    expect(TABLE_BORDERS.ascii.v).toBe('|')
  })
})
