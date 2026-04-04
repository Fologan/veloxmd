import {
  type TableModel, type TableAlign, type TableRenderResult,
  initTableCanvas, renderTableText, setTableCell, getTableCell,
  graphemeLen, graphemeIdxToOffset, cursorToTableCell, tableCellToCursor,
} from './table-engine.js'
import { TableToolbar, type TableAction } from './table-toolbar.js'
export { type TableAction }

export class TableEditController {
  private model: TableModel | null = null
  private lastRender: TableRenderResult | null = null
  private blockRange: [number, number] | null = null
  private activeRow = -1
  private activeCol = 0
  private canvasInited = false
  private toolbar: TableToolbar
  private actionCb: ((action: TableAction) => void) | null = null
  private rerenderCb: ((newLines: string[]) => void) | null = null
  private snapData: { lineTexts: string[]; cursorLine: number; cursorOffset: number } | null = null

  constructor(container: HTMLElement) { this.toolbar = new TableToolbar(container) }

  activate(root: HTMLElement, blockRange: [number, number], rawLines: string[]): void {
    if (!this.canvasInited) { initTableCanvas(getComputedStyle(root).font); this.canvasInited = true }
    this.blockRange = blockRange
    this.model = this.parseRawLines(rawLines)
    this.lastRender = renderTableText(this.model)
    this.activeRow = -1; this.activeCol = 0
    const el = root.querySelector(`[data-line="${blockRange[0]}"]`)
    if (el) this.toolbar.show(el.getBoundingClientRect())
    this.toolbar.updateAlignments(this.model.colAligns)
    this.toolbar.updateCell(0, 0, this.model.rows.length + 1, this.model.headers.length)
    this.toolbar.onAction((a) => this.actionCb?.(a))
  }
  deactivate(): void {
    this.model = null; this.lastRender = null; this.blockRange = null
    this.snapData = null; this.toolbar.hide()
  }
  isActive(): boolean { return this.model !== null }
  hasPendingSnap(): boolean { return this.snapData !== null }
  getToolbar(): TableToolbar { return this.toolbar }
  getModel(): TableModel | null { return this.model }
  getBlockRange(): [number, number] | null { return this.blockRange }
  getActiveCell() { return { row: this.activeRow, col: this.activeCol } }
  onNeedRerender(cb: (lines: string[]) => void): void { this.rerenderCb = cb }
  onAction(cb: (action: TableAction) => void): void { this.actionCb = cb }
  snap(root: HTMLElement): void {
    if (!this.blockRange) return
    const lineTexts = this.readBlockTexts(root)
    const sel = window.getSelection()
    let cLine = 0, cOff = 0
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0), lineEl = this.lineOf(r.startContainer, root)
      if (lineEl) {
        cLine = parseInt(lineEl.dataset.line || '0', 10) - this.blockRange[0]
        cOff = this.flatOffset(lineEl, r.startContainer, r.startOffset)
      }
    }
    this.snapData = { lineTexts, cursorLine: cLine, cursorOffset: cOff }
  }
  handleInput(root: HTMLElement): { line: number; offset: number } | null {
    if (!this.model || !this.lastRender || !this.blockRange || !this.snapData) return null
    const newTexts = this.readBlockTexts(root)
    const { lineTexts: oldTexts, cursorLine: sLine, cursorOffset: sOff } = this.snapData
    this.snapData = null
    let chLine = sLine
    for (let i = 0; i < Math.max(oldTexts.length, newTexts.length); i++)
      if ((oldTexts[i] ?? '') !== (newTexts[i] ?? '')) { chLine = i; break }
    const oldAbs = this.toAbs(sLine, sOff)
    const cell = cursorToTableCell(this.model, oldAbs, this.lastRender.cellMap)
    if (!cell) return null
    const oldL = oldTexts[chLine] ?? '', newL = newTexts[chLine] ?? ''
    const diff = newL.length - oldL.length
    const raw = getTableCell(this.model, cell.row, cell.col), gi = cell.gi
    let txt: string, ngi: number
    if (diff >= 0) {
      const at = graphemeIdxToOffset(raw, gi)
      const ins = diff > 0 ? newL.slice(sOff, sOff + diff) : ''
      txt = raw.slice(0, at) + ins + raw.slice(at); ngi = gi + graphemeLen(ins)
    } else {
      const dc = Math.min(gi, -diff)
      const s = graphemeIdxToOffset(raw, gi - dc), e = graphemeIdxToOffset(raw, gi)
      txt = raw.slice(0, s) + raw.slice(e); ngi = gi - dc
    }
    setTableCell(this.model, cell.row, cell.col, txt)
    this.activeRow = cell.row; this.activeCol = cell.col
    this.lastRender = renderTableText(this.model)
    const rLines = this.lastRender.text.split('\n')
    for (let i = 0; i < rLines.length; i++) {
      const el = root.querySelector(`[data-line="${this.blockRange[0] + i}"]`) as HTMLElement | null
      if (el) el.textContent = rLines[i]
    }
    this.syncToolbar()
    return this.fromAbs(tableCellToCursor(this.model, cell.row, cell.col, ngi, this.lastRender.cellMap))
  }
  navigateTab(reverse: boolean): { start: { line: number; offset: number }; end: { line: number; offset: number } } | null {
    if (!this.model || !this.lastRender || !this.blockRange) return null
    const cc = this.model.headers.length, rc = this.model.rows.length
    let r = this.activeRow, c = this.activeCol
    if (reverse) { c--; if (c < 0) { c = cc - 1; r--; if (r < -1) r = rc - 1 } }
    else {
      c++; if (c >= cc) { c = 0; r++
        if (r >= rc) {
          this.model.rows.push(new Array(cc).fill(''))
          this.lastRender = renderTableText(this.model)
          r = this.model.rows.length - 1
          this.rerenderCb?.(this.lastRender.text.split('\n'))
        }
      }
    }
    this.activeRow = r; this.activeCol = c; this.syncToolbar()
    const t = getTableCell(this.model, r, c)
    const s = this.fromAbs(tableCellToCursor(this.model, r, c, 0, this.lastRender.cellMap))
    const e = this.fromAbs(tableCellToCursor(this.model, r, c, graphemeLen(t), this.lastRender.cellMap))
    return (s && e) ? { start: s, end: e } : null
  }
  insertRowBelow(): string[] | null {
    if (!this.model) return null
    const at = this.activeRow === -1 ? 0 : this.activeRow + 1
    this.model.rows.splice(at, 0, new Array(this.model.headers.length).fill(''))
    this.activeRow = at; this.activeCol = 0
    this.lastRender = renderTableText(this.model); this.syncToolbar()
    return this.lastRender.text.split('\n')
  }
  executeAction(action: TableAction): string[] | null {
    if (!this.model || !this.lastRender) return null
    const cc = this.model.headers.length
    switch (action.type) {
      case 'add-row': return this.insertRowBelow()
      case 'add-col':
        this.model.headers.push('Col' + (cc + 1)); this.model.colAligns.push('left')
        for (const r of this.model.rows) r.push(''); break
      case 'delete-row':
        if (this.activeRow < 0 || this.model.rows.length <= 1) return null
        this.model.rows.splice(this.activeRow, 1)
        if (this.activeRow >= this.model.rows.length) this.activeRow = this.model.rows.length - 1; break
      case 'delete-col':
        if (cc <= 1) return null
        this.model.headers.splice(this.activeCol, 1); this.model.colAligns.splice(this.activeCol, 1)
        for (const r of this.model.rows) r.splice(this.activeCol, 1)
        if (this.activeCol >= this.model.headers.length) this.activeCol = this.model.headers.length - 1; break
      case 'sort-asc':  this.model.rows.sort((a, b) => (a[this.activeCol] ?? '').localeCompare(b[this.activeCol] ?? '')); break
      case 'sort-desc': this.model.rows.sort((a, b) => (b[this.activeCol] ?? '').localeCompare(a[this.activeCol] ?? '')); break
      case 'set-align': this.model.colAligns[action.col] = action.align; break
      case 'copy': navigator.clipboard.writeText(this.lastRender.text).catch(() => {}); return null
    }
    this.lastRender = renderTableText(this.model); this.syncToolbar()
    return this.lastRender.text.split('\n')
  }
  destroy(): void {
    this.deactivate(); this.toolbar.destroy()
    this.actionCb = null; this.rerenderCb = null
  }
  private parseRawLines(rawLines: string[]): TableModel {
    const ext = (l: string): string[] => {
      const t = l.trim(), s = t.startsWith('|') ? t.slice(1) : t
      return (s.endsWith('|') ? s.slice(0, -1) : s).split('|').map(c => c.trim())
    }
    const headers = rawLines.length > 0 ? ext(rawLines[0]) : ['Col1']
    const colAligns: TableAlign[] = headers.map(() => 'left')
    if (rawLines.length > 1) {
      rawLines[1].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').forEach((cell, i) => {
        if (i >= headers.length) return
        const c = cell.trim()
        if (c.startsWith('::') && c.endsWith('::')) colAligns[i] = 'justify'
        else if (c.startsWith(':') && c.endsWith(':')) colAligns[i] = 'center'
        else if (c.endsWith(':')) colAligns[i] = 'right'
      })
    }
    const rows: string[][] = []
    for (let i = 2; i < rawLines.length; i++) {
      const cells = ext(rawLines[i])
      while (cells.length < headers.length) cells.push('')
      if (cells.length > headers.length) cells.length = headers.length
      rows.push(cells)
    }
    return { headers, rows, colAligns, rowAligns: {} }
  }

  private readBlockTexts(root: HTMLElement): string[] {
    const out: string[] = []
    for (let i = this.blockRange![0]; i < this.blockRange![1]; i++) {
      const el = root.querySelector(`[data-line="${i}"]`) as HTMLElement | null
      out.push(el ? this.readLineText(el) : '')
    }
    return out
  }

  private readLineText(el: HTMLElement): string {
    let t = ''
    for (let n = 0; n < el.childNodes.length; n++) {
      const nd = el.childNodes[n]
      if (nd.nodeType === Node.TEXT_NODE) t += nd.textContent || ''
      else if (nd instanceof HTMLElement) {
        if (nd.contentEditable === 'false') continue
        t += nd.textContent || ''
      }
    }
    return t
  }

  private lineOf(node: Node | null, root: HTMLElement): HTMLElement | null {
    let c = node
    while (c && c !== root) {
      if (c instanceof HTMLElement && c.dataset.line !== undefined) return c
      c = c.parentNode
    }
    return null
  }

  private flatOffset(lineEl: HTMLElement, container: Node, offset: number): number {
    let flat = 0
    const walk = (node: Node): boolean => {
      if (node === container) { flat += (node.nodeType === Node.TEXT_NODE) ? offset : 0; return true }
      if (node.nodeType === Node.TEXT_NODE) flat += (node.textContent || '').length
      else if (node instanceof HTMLElement && node.contentEditable === 'false') return false
      for (let n = 0; n < node.childNodes.length; n++) { if (walk(node.childNodes[n])) return true }
      return false
    }
    walk(lineEl); return flat
  }

  private fromAbs(abs: number): { line: number; offset: number } | null {
    if (!this.lastRender || !this.blockRange) return null
    const lines = this.lastRender.text.split('\n')
    let pos = 0
    for (let i = 0; i < lines.length; i++) {
      if (abs <= pos + lines[i].length) return { line: this.blockRange[0] + i, offset: abs - pos }
      pos += lines[i].length + 1
    }
    return null
  }

  private toAbs(line: number, offset: number): number {
    if (!this.lastRender) return 0
    const lines = this.lastRender.text.split('\n')
    let abs = 0
    for (let i = 0; i < line && i < lines.length; i++) abs += lines[i].length + 1
    return abs + Math.min(offset, lines[line]?.length ?? 0)
  }

  private syncToolbar(): void {
    if (!this.model) return
    this.toolbar.updateCell(
      this.activeRow === -1 ? 0 : this.activeRow + 1,
      this.activeCol, this.model.rows.length + 1, this.model.headers.length,
    )
    this.toolbar.updateAlignments(this.model.colAligns)
  }
}
