// =============================================================================
// LiveEditor — base editor class with protected extension points
//
// Uses: types, parse-inline, parse-block, render, cursor
// Extended by: LiveEditorPlus (editorPlus.ts)
// =============================================================================

import type { LiveLine, LiveSegment, ViewMode } from './types.js'
import { HybridController } from './hybrid.js'
import { parseLiveDocument } from './parse-block.js'
import { createSegmentNode, renderLineElement } from './render.js'
import { getFlatOffset, setFlatOffset } from './cursor.js'
import { Toolbar } from './toolbar.js'
import { findTableBlockRange, isTableBlockType } from './features/tables/line.js'

interface TextPosition {
  line: number
  offset: number
}

interface SelectionSnapshot {
  anchor: TextPosition
  focus: TextPosition
}

interface TextSelection extends SelectionSnapshot {
  start: TextPosition
  end: TextPosition
  startFlat: number
  endFlat: number
  isCollapsed: boolean
}

interface Snapshot {
  lines: string[]
  text: string
  selection: SelectionSnapshot | null
}

type DeleteUnit = 'character' | 'word' | 'line'

const MAX_HISTORY = 200
const MERGE_WINDOW = 400 // ms — consecutive typing merges into one undo entry
const CARET_SCROLL_TOP_MIN_MARGIN = 32
const CARET_SCROLL_TOP_MAX_MARGIN = 220
const CARET_SCROLL_TOP_RATIO = 0.28
const CARET_SCROLL_BOTTOM_MIN_MARGIN = 72
const CARET_SCROLL_BOTTOM_MAX_MARGIN = 160
const CARET_SCROLL_BOTTOM_RATIO = 0.18
const CARET_SCROLL_ANIMATION_MS = 180
const CARET_SCROLL_SNAP_PX = 1
const SCROLLABLE_OVERFLOW = /auto|scroll|overlay/

export interface EditorOptions {
  onChange?: (text: string) => void
  placeholder?: string
  toolbar?: boolean
}

export class LiveEditor {
  protected root: HTMLDivElement
  protected lines: string[] = ['']
  protected rendering = false
  protected focusedLine = -1
  protected focusedBlockRange: [number, number] | null = null
  protected viewMode: ViewMode = 'source'
  protected wrapper: HTMLDivElement
  private toolbar?: Toolbar
  private hybrid = new HybridController()
  private boundSelectionChange = () => this.onSelectionChange()
  private changeCallback: ((text: string) => void) | null = null
  private mutationObserver: MutationObserver | null = null
  private suppressMutationSync = false
  private mutationSyncQueued = false
  private caretScrollFrame: number | null = null
  private caretScrollAnimationFrame: number | null = null

  private prevLines: string[] = ['']
  private prevParsed: LiveLine[] = []

  // Undo / redo stacks
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private lastSnapshotTime = 0
  private pendingSnapshot: Snapshot | null = null
  private composing = false
  private compositionSnapshot: Snapshot | null = null

  constructor(container: HTMLElement, options?: EditorOptions) {
    this.wrapper = document.createElement('div')
    this.wrapper.className = 'veloxmd-wrapper'
    container.appendChild(this.wrapper)

    this.root = document.createElement('div')
    this.root.className = 'live-editor source-mode'
    this.root.contentEditable = 'true'
    this.root.spellcheck = false
    this.root.setAttribute('role', 'textbox')
    this.root.setAttribute('aria-multiline', 'true')
    this.root.setAttribute('aria-label', 'Markdown editor')
    this.root.setAttribute('data-placeholder', options?.placeholder ?? 'Start typing markdown\u2026')
    this.wrapper.appendChild(this.root)

    if (options?.toolbar) this.toolbar = new Toolbar(this, this.wrapper)
    if (options?.onChange) this.changeCallback = options.onChange

    this.root.addEventListener('beforeinput', (e) => this.onBeforeInput(e as InputEvent))
    this.root.addEventListener('input', () => this.onInput())
    this.root.addEventListener('paste', (e) => this.onPaste(e))
    this.root.addEventListener('copy', (e) => this.onCopy(e))
    this.root.addEventListener('cut', (e) => this.onCut(e))
    this.root.addEventListener('keydown', (e) => this.onKeyDown(e))
    this.root.addEventListener('mousedown', (e) => this.onMouseDown(e))
    this.root.addEventListener('compositionstart', () => this.onCompositionStart())
    this.root.addEventListener('compositionend', () => this.onCompositionEnd())
    document.addEventListener('selectionchange', this.boundSelectionChange)

    this.renderAll()
    this.root.focus()
    this.pushSnapshot() // initial empty state
    this.mutationObserver = new MutationObserver(records => {
      const onlyNonEditableVisualChanges = records.length > 0 && records.every(record => {
        const element = record.target instanceof Element
          ? record.target
          : record.target.parentElement
        return Boolean(element?.closest('[contenteditable="false"]'))
      })
      if (!onlyNonEditableVisualChanges) this.queueDomMutationSync()
    })
    this.mutationObserver.observe(this.root, {
      childList: true,
      characterData: true,
      subtree: true,
    })
  }

  destroy(): void {
    this.toolbar?.destroy()
    this.mutationObserver?.disconnect()
    if (this.caretScrollFrame !== null) cancelAnimationFrame(this.caretScrollFrame)
    if (this.caretScrollAnimationFrame !== null) cancelAnimationFrame(this.caretScrollAnimationFrame)
    document.removeEventListener('selectionchange', this.boundSelectionChange)
    this.wrapper.remove()
  }

  setValue(text: string): void {
    this.lines = this.toLines(text)
    this.undoStack = []
    this.redoStack.length = 0
    this.pendingSnapshot = null
    this.lastSnapshotTime = 0
    this.composing = false
    this.compositionSnapshot = null
    this.renderAll()
    this.pushSnapshot(this.snap({
      anchor: { line: 0, offset: 0 },
      focus: { line: 0, offset: 0 },
    }))
  }

  getValue(): string {
    return this.lines.join('\n')
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode
    this.root.classList.toggle('hybrid-mode', mode === 'hybrid')
    this.root.classList.toggle('source-mode', mode === 'source')
    this.renderAll()
  }

  getViewMode(): ViewMode {
    return this.viewMode
  }

  onChange(callback: (text: string) => void): void {
    this.changeCallback = callback
  }

  /** Apply one source-level transaction from an interactive feature. */
  protected replaceLineRange(start: number, end: number, replacement: string[]): void {
    const safeStart = Math.max(0, Math.min(start, this.lines.length))
    const safeEnd = Math.max(safeStart, Math.min(end, this.lines.length))
    const nextLines = [
      ...this.lines.slice(0, safeStart),
      ...replacement,
      ...this.lines.slice(safeEnd),
    ]
    if (nextLines.join('\n') === this.getValue()) return

    this.pushSnapshot()
    this.lines = nextLines.length > 0 ? nextLines : ['']
    this.pendingSnapshot = null
    this.redoStack.length = 0
    this.renderAll()
    this.emitChange()
  }

  insert(text: string): void {
    this.replaceCurrentSelection(text)
  }

  toggleInline(before: string, after: string, placeholder: string): void {
    if (!this.root.contains(document.activeElement) && document.activeElement !== this.root) {
      this.root.focus()
    }

    const sel = window.getSelection()
    if (!sel) return

    const hasSelection = sel.rangeCount > 0 && !sel.isCollapsed

    if (hasSelection) {
      const range = sel.getRangeAt(0)
      if (!this.root.contains(range.startContainer) || !this.root.contains(range.endContainer)) return

      const startPos = this._rangeEndpointToLineOffset(range.startContainer, range.startOffset)
      if (!startPos) return
      const endPos = this._rangeEndpointToLineOffset(range.endContainer, range.endOffset)
      if (!endPos) return

      this.pushSnapshot()

      const startFlat = this._lineOffsetToFlat(startPos.line, startPos.offset)
      const endFlat = this._lineOffsetToFlat(endPos.line, endPos.offset)
      if (startFlat === null || endFlat === null) return

      const flatStart = Math.min(startFlat, endFlat)
      const flatEnd = Math.max(startFlat, endFlat)

      const fullText = this.getValue()
      const selectedText = fullText.slice(flatStart, flatEnd)
      const newText = fullText.slice(0, flatStart) + before + selectedText + after + fullText.slice(flatEnd)
      this.lines = newText.split('\n')

      const cursorFlat = flatStart + before.length + selectedText.length + after.length
      const cursorPos = this._flatToLineOffset(cursorFlat)

      this.renderAll()
      this.redoStack.length = 0
      if (cursorPos) this.restoreCursor(cursorPos)
      this.emitChange()
    } else {
      let cursor = this.saveCursor()
      if (!cursor) {
        this.root.focus()
        cursor = { line: 0, offset: 0 }
      }

      this.pushSnapshot()

      const insertText = before + placeholder + after
      const cursorFlat = this._lineOffsetToFlat(cursor.line, cursor.offset)
      if (cursorFlat === null) return

      const fullText = this.getValue()
      this.lines = (fullText.slice(0, cursorFlat) + insertText + fullText.slice(cursorFlat)).split('\n')

      const placeholderStart = this._flatToLineOffset(cursorFlat + before.length)
      const placeholderEnd = this._flatToLineOffset(cursorFlat + before.length + placeholder.length)

      this.renderAll()
      this.redoStack.length = 0

      if (placeholderStart && placeholderEnd) {
        this._restoreCursorRange(placeholderStart, placeholderEnd)
      } else if (placeholderStart) {
        this.restoreCursor(placeholderStart)
      }

      this.emitChange()
    }
  }

  toggleBlock(prefix: string): void {
    let cursor = this.saveCursor()
    if (!cursor) {
      this.root.focus()
      cursor = this.saveCursor()
      if (!cursor) cursor = { line: 0, offset: 0 }
    }

    const lineIdx = Math.max(0, Math.min(cursor.line, this.lines.length - 1))
    const originalLine = this.lines[lineIdx] ?? ''

    this.pushSnapshot()

    let newLine: string
    let offsetDelta = 0

    if (prefix === '') {
      const headingMatch = originalLine.match(/^(#{1,6}\s)/)
      if (headingMatch) {
        newLine = originalLine.slice(headingMatch[1].length)
        offsetDelta = -headingMatch[1].length
      } else {
        newLine = originalLine
      }
    } else if (prefix.startsWith('#')) {
      const headingMatch = originalLine.match(/^(#{1,6}\s)/)
      if (headingMatch) {
        const existingPrefix = headingMatch[1]
        if (existingPrefix === prefix) {
          newLine = originalLine.slice(existingPrefix.length)
          offsetDelta = -existingPrefix.length
        } else {
          newLine = prefix + originalLine.slice(existingPrefix.length)
          offsetDelta = prefix.length - existingPrefix.length
        }
      } else {
        newLine = prefix + originalLine
        offsetDelta = prefix.length
      }
    } else {
      if (originalLine.startsWith(prefix)) {
        newLine = originalLine.slice(prefix.length)
        offsetDelta = -prefix.length
      } else {
        newLine = prefix + originalLine
        offsetDelta = prefix.length
      }
    }

    this.lines[lineIdx] = newLine
    const newOffset = Math.max(0, Math.min(cursor.offset + offsetDelta, newLine.length))

    this.renderAll()
    this.redoStack.length = 0
    this.restoreCursor({ line: lineIdx, offset: newOffset })
    this.emitChange()
  }

  insertTemplate(template: string): void {
    this.insert(template)
  }

  wrapOrInsert(template: string, placeholder: string): void {
    if (!this.root.contains(document.activeElement) && document.activeElement !== this.root) {
      this.root.focus()
    }

    const sel = window.getSelection()
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed

    if (hasSelection) {
      const range = sel.getRangeAt(0)
      if (!this.root.contains(range.startContainer) || !this.root.contains(range.endContainer)) return

      const startPos = this._rangeEndpointToLineOffset(range.startContainer, range.startOffset)
      if (!startPos) return
      const endPos = this._rangeEndpointToLineOffset(range.endContainer, range.endOffset)
      if (!endPos) return

      this.pushSnapshot()

      const startFlat = this._lineOffsetToFlat(startPos.line, startPos.offset)
      const endFlat = this._lineOffsetToFlat(endPos.line, endPos.offset)
      if (startFlat === null || endFlat === null) return

      const flatStart = Math.min(startFlat, endFlat)
      const flatEnd = Math.max(startFlat, endFlat)

      const fullText = this.getValue()
      const selectedText = fullText.slice(flatStart, flatEnd)
      const filled = template.replace('${sel}', selectedText)
      const newText = fullText.slice(0, flatStart) + filled + fullText.slice(flatEnd)
      this.lines = newText.split('\n')

      const cursorFlat = flatStart + filled.length
      const cursorPos = this._flatToLineOffset(cursorFlat)

      this.renderAll()
      this.redoStack.length = 0
      if (cursorPos) this.restoreCursor(cursorPos)
      this.emitChange()
    } else {
      this.insert(template.replace('${sel}', placeholder))
    }
  }

  // ---------------------------------------------------------------------------
  // Extension points — override in LiveEditorPlus
  // ---------------------------------------------------------------------------

  protected parseDocument(rawLines: string[]): LiveLine[] {
    return parseLiveDocument(rawLines)
  }

  protected createNode(seg: LiveSegment): Node {
    return createSegmentNode(seg)
  }

  protected renderLine(line: LiveLine, index: number): HTMLElement {
    return renderLineElement(line, index, (seg) => this.createNode(seg))
  }

  // ---------------------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------------------

  private snap(selection?: SelectionSnapshot | null): Snapshot {
    const lines = [...this.lines]
    return { lines, text: lines.join('\n'), selection: selection ?? this.saveSelection() }
  }

  private pushSnapshot(snapshot?: Snapshot): void {
    const s = snapshot ?? this.snap()
    const top = this.undoStack[this.undoStack.length - 1]
    // Skip if content identical to top
    if (top && top.text === s.text) return
    this.undoStack.push(s)
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift()
  }

  private recordChange(): void {
    const now = Date.now()
    if (now - this.lastSnapshotTime > MERGE_WINDOW) {
      // Enough time passed — save the pending state as an undo point
      if (this.pendingSnapshot) {
        const top = this.undoStack[this.undoStack.length - 1]
        if (!top || top.text !== this.pendingSnapshot.text) {
          this.undoStack.push(this.pendingSnapshot)
          if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift()
        }
      }
    }
    this.pendingSnapshot = this.snap()
    this.lastSnapshotTime = now
    this.redoStack.length = 0
  }

  public undo(): void {
    // Flush any pending snapshot first
    if (this.pendingSnapshot) {
      const top = this.undoStack[this.undoStack.length - 1]
      if (!top || top.text !== this.pendingSnapshot.text) {
        this.undoStack.push(this.pendingSnapshot)
      }
      this.pendingSnapshot = null
    }

    // Save current state to redo stack
    this.redoStack.push(this.snap())

    const prev = this.undoStack.pop()
    if (!prev) { this.redoStack.pop(); return }

    // If popped state is same as current, pop one more
    if (prev.text === this.lines.join('\n')) {
      const prev2 = this.undoStack.pop()
      if (!prev2) { this.undoStack.push(prev); this.redoStack.pop(); return }
      this.applySnapshot(prev2)
    } else {
      this.applySnapshot(prev)
    }
    this.emitChange()
  }

  public redo(): void {
    const next = this.redoStack.pop()
    if (!next) return

    // Push current to undo
    this.undoStack.push(this.snap())
    this.pendingSnapshot = null
    this.applySnapshot(next)
    this.emitChange()
  }

  private applySnapshot(s: Snapshot): void {
    this.lines = [...s.lines]
    this.renderAll()
    if (s.selection) this.restoreSelection(s.selection)
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  private emitChange(): void {
    if (this.changeCallback) this.changeCallback(this.getValue())
  }

  private normalizeInputText(text: string): string {
    return text.replace(/\r\n?/g, '\n')
  }

  private toLines(text: string): string[] {
    return this.normalizeInputText(text).split('\n')
  }

  private positionToDom(pos: TextPosition): { node: Node; offset: number } | null {
    const el = this.root.querySelector(`[data-line="${pos.line}"]`)
    if (!el) return null
    return setFlatOffset(el, Math.max(0, pos.offset))
  }

  private saveSelection(): SelectionSnapshot | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) return null
    if (!this.root.contains(sel.anchorNode) || !this.root.contains(sel.focusNode)) return null

    const anchor = this._rangeEndpointToLineOffset(sel.anchorNode, sel.anchorOffset)
    const focus = this._rangeEndpointToLineOffset(sel.focusNode, sel.focusOffset)
    if (!anchor || !focus) return null
    return { anchor, focus }
  }

  private restoreSelection(selection: SelectionSnapshot): void {
    const anchor = this.positionToDom(selection.anchor)
    const focus = this.positionToDom(selection.focus)
    const sel = window.getSelection()
    if (!anchor || !focus || !sel) return

    let restored = false
    try {
      if (typeof sel.setBaseAndExtent === 'function') {
        sel.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
        restored = true
      } else {
        const anchorFlat = this._lineOffsetToFlat(selection.anchor.line, selection.anchor.offset)
        const focusFlat = this._lineOffsetToFlat(selection.focus.line, selection.focus.offset)
        const range = document.createRange()
        if (anchorFlat !== null && focusFlat !== null && anchorFlat > focusFlat) {
          range.setStart(focus.node, focus.offset)
          range.setEnd(anchor.node, anchor.offset)
        } else {
          range.setStart(anchor.node, anchor.offset)
          range.setEnd(focus.node, focus.offset)
        }
        sel.removeAllRanges()
        sel.addRange(range)
        restored = true
      }
    } catch { /* best-effort */ }

    if (restored) this.queueCaretScrollIntoView()
  }

  private getTextSelection(): TextSelection | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) return null

    const range = sel.getRangeAt(0)
    if (
      !this.root.contains(range.startContainer)
      || !this.root.contains(range.endContainer)
      || !this.root.contains(sel.anchorNode)
      || !this.root.contains(sel.focusNode)
    ) return null

    const start = this._rangeEndpointToLineOffset(range.startContainer, range.startOffset)
    const end = this._rangeEndpointToLineOffset(range.endContainer, range.endOffset)
    const anchor = this._rangeEndpointToLineOffset(sel.anchorNode, sel.anchorOffset)
    const focus = this._rangeEndpointToLineOffset(sel.focusNode, sel.focusOffset)
    if (!start || !end || !anchor || !focus) return null

    const startFlat = this._lineOffsetToFlat(start.line, start.offset)
    const endFlat = this._lineOffsetToFlat(end.line, end.offset)
    if (startFlat === null || endFlat === null) return null

    return {
      anchor,
      focus,
      start,
      end,
      startFlat: Math.min(startFlat, endFlat),
      endFlat: Math.max(startFlat, endFlat),
      isCollapsed: sel.isCollapsed || startFlat === endFlat,
    }
  }

  private currentFlatOffset(): number | null {
    const selection = this.getTextSelection()
    if (selection) return selection.startFlat
    const cursor = this.saveCursor()
    return cursor ? this._lineOffsetToFlat(cursor.line, cursor.offset) : 0
  }

  private replaceCurrentSelection(text: string): boolean {
    const selection = this.getTextSelection()
    if (selection) return this.replaceFlatRange(selection.startFlat, selection.endFlat, text)

    const flat = this.currentFlatOffset()
    if (flat === null) return false
    return this.replaceFlatRange(flat, flat, text)
  }

  private replaceFlatRange(startFlat: number, endFlat: number, text: string): boolean {
    const fullText = this.getValue()
    const safeStart = Math.max(0, Math.min(startFlat, fullText.length))
    const safeEnd = Math.max(safeStart, Math.min(endFlat, fullText.length))
    const inserted = this.normalizeInputText(text)
    if (safeStart === safeEnd && inserted.length === 0) return false

    this.pushSnapshot()
    const nextText = fullText.slice(0, safeStart) + inserted + fullText.slice(safeEnd)
    this.lines = this.toLines(nextText)
    this.pendingSnapshot = null
    this.redoStack.length = 0
    this.renderAll()

    const nextPos = this._flatToLineOffset(safeStart + inserted.length)
    if (nextPos) this.restoreSelection({ anchor: nextPos, focus: nextPos })
    this.emitChange()
    return true
  }

  private selectedText(): string | null {
    const selection = this.getTextSelection()
    if (!selection || selection.isCollapsed) return null
    return this.getValue().slice(selection.startFlat, selection.endFlat)
  }

  private previousGraphemeBoundary(text: string, index: number): number {
    if (index <= 0) return 0
    const Segmenter = (Intl as any).Segmenter
    if (Segmenter) {
      let previous = 0
      for (const segment of new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
        if (segment.index >= index) break
        previous = segment.index
      }
      return previous
    }
    return index - 1
  }

  private nextGraphemeBoundary(text: string, index: number): number {
    if (index >= text.length) return text.length
    const Segmenter = (Intl as any).Segmenter
    if (Segmenter) {
      for (const segment of new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
        if (segment.index > index) return segment.index
      }
      return text.length
    }
    return index + 1
  }

  private charBefore(text: string, index: number): string {
    const start = this.previousGraphemeBoundary(text, index)
    return text.slice(start, index)
  }

  private charAfter(text: string, index: number): string {
    const end = this.nextGraphemeBoundary(text, index)
    return text.slice(index, end)
  }

  private isWordCharacter(text: string): boolean {
    return /^[\p{L}\p{N}_]$/u.test(text)
  }

  private findWordBoundaryBackward(text: string, index: number): number {
    let cursor = index
    while (cursor > 0 && /\s/u.test(this.charBefore(text, cursor))) {
      cursor = this.previousGraphemeBoundary(text, cursor)
    }
    if (cursor === 0) return 0

    const wordMode = this.isWordCharacter(this.charBefore(text, cursor))
    while (cursor > 0) {
      const char = this.charBefore(text, cursor)
      if (wordMode ? !this.isWordCharacter(char) : /\s/u.test(char) || this.isWordCharacter(char)) break
      cursor = this.previousGraphemeBoundary(text, cursor)
    }
    return cursor
  }

  private findWordBoundaryForward(text: string, index: number): number {
    let cursor = index
    while (cursor < text.length && /\s/u.test(this.charAfter(text, cursor))) {
      cursor = this.nextGraphemeBoundary(text, cursor)
    }
    if (cursor >= text.length) return text.length

    const wordMode = this.isWordCharacter(this.charAfter(text, cursor))
    while (cursor < text.length) {
      const char = this.charAfter(text, cursor)
      if (wordMode ? !this.isWordCharacter(char) : /\s/u.test(char) || this.isWordCharacter(char)) break
      cursor = this.nextGraphemeBoundary(text, cursor)
    }
    return cursor
  }

  private deleteBackward(unit: DeleteUnit = 'character'): boolean {
    const selection = this.getTextSelection()
    if (selection && !selection.isCollapsed) {
      return this.replaceFlatRange(selection.startFlat, selection.endFlat, '')
    }

    const fullText = this.getValue()
    const cursor = selection?.startFlat ?? this.currentFlatOffset()
    if (cursor === null || cursor <= 0) return false

    const start = unit === 'word'
      ? this.findWordBoundaryBackward(fullText, cursor)
      : unit === 'line'
        ? this._lineOffsetToFlat(selection?.start.line ?? this.saveCursor()?.line ?? 0, 0) ?? cursor
        : this.previousGraphemeBoundary(fullText, cursor)
    return this.replaceFlatRange(start, cursor, '')
  }

  private deleteForward(unit: DeleteUnit = 'character'): boolean {
    const selection = this.getTextSelection()
    if (selection && !selection.isCollapsed) {
      return this.replaceFlatRange(selection.startFlat, selection.endFlat, '')
    }

    const fullText = this.getValue()
    const cursor = selection?.endFlat ?? this.currentFlatOffset()
    if (cursor === null || cursor >= fullText.length) return false

    const cursorPos = selection?.end ?? this.saveCursor()
    const lineEnd = cursorPos
      ? this._lineOffsetToFlat(cursorPos.line, this.lines[cursorPos.line]?.length ?? 0)
      : cursor
    const end = unit === 'word'
      ? this.findWordBoundaryForward(fullText, cursor)
      : unit === 'line'
        ? lineEnd ?? cursor
        : this.nextGraphemeBoundary(fullText, cursor)
    return this.replaceFlatRange(cursor, end, '')
  }

  private handleTab(reverse: boolean): boolean {
    const selection = this.getTextSelection()
    if (!selection || selection.isCollapsed || selection.start.line === selection.end.line) {
      if (reverse) return false
      return this.replaceCurrentSelection('  ')
    }

    const endLine = selection.end.offset === 0
      ? Math.max(selection.start.line, selection.end.line - 1)
      : selection.end.line
    this.pushSnapshot()
    for (let line = selection.start.line; line <= endLine; line += 1) {
      const text = this.lines[line] ?? ''
      if (reverse) {
        this.lines[line] = text.startsWith('  ')
          ? text.slice(2)
          : text.startsWith('\t')
            ? text.slice(1)
            : text
      } else {
        this.lines[line] = `  ${text}`
      }
    }
    this.pendingSnapshot = null
    this.redoStack.length = 0
    this.renderAll()
    this.restoreSelection({
      anchor: { line: selection.start.line, offset: 0 },
      focus: { line: endLine, offset: this.lines[endLine]?.length ?? 0 },
    })
    this.emitChange()
    return true
  }

  private focusFlatOffset(): number | null {
    const selection = this.saveSelection()
    if (!selection) return this.currentFlatOffset()
    return this._lineOffsetToFlat(selection.focus.line, selection.focus.offset)
  }

  private restoreSelectionByFlat(anchorFlat: number, focusFlat: number): boolean {
    const fullText = this.getValue()
    const anchor = this._flatToLineOffset(Math.max(0, Math.min(anchorFlat, fullText.length)))
    const focus = this._flatToLineOffset(Math.max(0, Math.min(focusFlat, fullText.length)))
    if (!anchor || !focus) return false
    this.restoreSelection({ anchor, focus })
    return true
  }

  private moveSelectionToFlat(targetFlat: number, extend: boolean): boolean {
    const current = this.saveSelection()
    const focus = this.focusFlatOffset()
    if (focus === null) return false

    const anchor = extend && current
      ? this._lineOffsetToFlat(current.anchor.line, current.anchor.offset)
      : targetFlat
    if (anchor === null) return false
    return this.restoreSelectionByFlat(anchor, targetFlat)
  }

  private moveHorizontal(direction: 'backward' | 'forward', extend: boolean, byWord: boolean): boolean {
    const selection = this.getTextSelection()
    const fullText = this.getValue()

    if (selection && !selection.isCollapsed && !extend) {
      return this.restoreSelectionByFlat(
        direction === 'backward' ? selection.startFlat : selection.endFlat,
        direction === 'backward' ? selection.startFlat : selection.endFlat,
      )
    }

    const focus = this.focusFlatOffset()
    if (focus === null) return false
    const next = direction === 'backward'
      ? byWord
        ? this.findWordBoundaryBackward(fullText, focus)
        : this.previousGraphemeBoundary(fullText, focus)
      : byWord
        ? this.findWordBoundaryForward(fullText, focus)
        : this.nextGraphemeBoundary(fullText, focus)
    return this.moveSelectionToFlat(next, extend)
  }

  private moveToLineBoundary(toEnd: boolean, extend: boolean): boolean {
    const selection = this.saveSelection()
    const cursor = selection?.focus ?? this.saveCursor()
    if (!cursor) return false
    const target = this._lineOffsetToFlat(
      cursor.line,
      toEnd ? this.lines[cursor.line]?.length ?? 0 : 0,
    )
    return target === null ? false : this.moveSelectionToFlat(target, extend)
  }

  private moveToDocumentBoundary(toEnd: boolean, extend: boolean): boolean {
    const target = toEnd ? this.getValue().length : 0
    return this.moveSelectionToFlat(target, extend)
  }

  private selectAll(): void {
    this.restoreSelectionByFlat(0, this.getValue().length)
  }

  protected runWithMutationSyncSuppressed(work: () => void): void {
    this.suppressMutationSync = true
    try {
      work()
    } finally {
      queueMicrotask(() => {
        this.suppressMutationSync = false
      })
    }
  }

  private queueDomMutationSync(): void {
    if (this.rendering || this.suppressMutationSync || this.mutationSyncQueued || this.composing) return

    this.mutationSyncQueued = true
    queueMicrotask(() => {
      this.mutationSyncQueued = false
      if (this.rendering || this.suppressMutationSync || this.composing) return

      const previousText = this.getValue()
      const cursor = this.saveCursor()
      this.pushSnapshot()
      this.readLines()
      const nextText = this.getValue()

      if (nextText === previousText) return

      this.redoStack.length = 0
      this.renderAll()
      if (cursor) this.restoreCursor(cursor)
      this.emitChange()
    })
  }

  private onBeforeInput(e: InputEvent): void {
    if (this.rendering) return
    if (this.composing && e.inputType === 'insertCompositionText') return
    if (!e.cancelable) return

    switch (e.inputType) {
      case 'insertParagraph':
        e.preventDefault()
        this.replaceCurrentSelection('\n')
        break
      case 'insertLineBreak':
        e.preventDefault()
        this.replaceCurrentSelection('  \n')
        break
      case 'insertFromPaste': {
        const text = e.dataTransfer?.getData('text/plain') ?? e.data ?? ''
        if (!text) return
        e.preventDefault()
        this.replaceCurrentSelection(text)
        break
      }
      case 'deleteContentBackward':
        e.preventDefault()
        this.deleteBackward()
        break
      case 'deleteContentForward':
        e.preventDefault()
        this.deleteForward()
        break
      case 'deleteWordBackward':
        e.preventDefault()
        this.deleteBackward('word')
        break
      case 'deleteWordForward':
        e.preventDefault()
        this.deleteForward('word')
        break
      case 'deleteHardLineBackward':
      case 'deleteSoftLineBackward':
        e.preventDefault()
        this.deleteBackward('line')
        break
      case 'deleteHardLineForward':
      case 'deleteSoftLineForward':
        e.preventDefault()
        this.deleteForward('line')
        break
      case 'historyUndo':
        e.preventDefault()
        this.undo()
        break
      case 'historyRedo':
        e.preventDefault()
        this.redo()
        break
      case 'formatBold':
        e.preventDefault()
        this.toggleInline('**', '**', 'bold')
        break
      case 'formatItalic':
        e.preventDefault()
        this.toggleInline('*', '*', 'italic')
        break
      case 'formatUnderline':
        e.preventDefault()
        this.toggleInline('<u>', '</u>', 'underline')
        break
      case 'formatStrikeThrough':
        e.preventDefault()
        this.toggleInline('~~', '~~', 'strikethrough')
        break
    }
  }

  protected onInput(): void {
    if (this.rendering) return
    if (this.composing) {
      this.readLines()
      this.emitChange()
      return
    }

    const cursor = this.saveCursor()
    this.readLines()
    this.recordChange()
    if (!this.renderIncremental()) {
      this.renderAll()
    }
    if (cursor) this.restoreCursor(cursor)
    this.emitChange()
  }

  protected onPaste(e: ClipboardEvent): void {
    e.preventDefault()
    const pastedText = this.normalizeInputText(e.clipboardData?.getData('text/plain') || '')
    if (!pastedText) return
    this.replaceCurrentSelection(pastedText)
  }

  protected transformCopiedText(text: string): string {
    return text
  }

  protected onCopy(e: ClipboardEvent): void {
    const text = this.selectedText()
    if (text === null) return
    e.clipboardData?.setData('text/plain', this.transformCopiedText(text))
    e.preventDefault()
  }

  private onCut(e: ClipboardEvent): void {
    const text = this.selectedText()
    if (text === null) return
    e.clipboardData?.setData('text/plain', text)
    e.preventDefault()
    const selection = this.getTextSelection()
    if (selection) this.replaceFlatRange(selection.startFlat, selection.endFlat, '')
  }

  private onCompositionStart(): void {
    if (this.composing) return
    this.composing = true
    this.compositionSnapshot = this.snap()
  }

  private onCompositionEnd(): void {
    if (!this.composing) return

    const selection = this.saveSelection()
    this.composing = false
    this.readLines()

    if (this.compositionSnapshot && this.compositionSnapshot.text !== this.getValue()) {
      this.pushSnapshot(this.compositionSnapshot)
      this.pendingSnapshot = null
      this.redoStack.length = 0
    }

    this.renderAll()
    if (selection) this.restoreSelection(selection)
    this.compositionSnapshot = null
    this.emitChange()
  }

  protected onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Tab') {
      e.preventDefault()
      this.handleTab(e.shiftKey)
      return
    }

    if (this.composing || e.isComposing) return

    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      this.replaceCurrentSelection(e.shiftKey ? '  \n' : '\n')
      return
    }

    if (e.key === 'Backspace' && !e.altKey) {
      e.preventDefault()
      this.deleteBackward(e.ctrlKey || e.metaKey ? 'word' : 'character')
      return
    }

    if (e.key === 'Delete' && !e.altKey) {
      e.preventDefault()
      this.deleteForward(e.ctrlKey || e.metaKey ? 'word' : 'character')
      return
    }

    const key = e.key.toLowerCase()
    const usesCommandKey = e.ctrlKey || e.metaKey

    if (key === 'a' && usesCommandKey && !e.shiftKey && !e.altKey) {
      e.preventDefault()
      this.selectAll()
      return
    }

    if (e.key === 'Home' && !e.altKey) {
      e.preventDefault()
      if (usesCommandKey) {
        this.moveToDocumentBoundary(false, e.shiftKey)
      } else {
        this.moveToLineBoundary(false, e.shiftKey)
      }
      return
    }

    if (e.key === 'End' && !e.altKey) {
      e.preventDefault()
      if (usesCommandKey) {
        this.moveToDocumentBoundary(true, e.shiftKey)
      } else {
        this.moveToLineBoundary(true, e.shiftKey)
      }
      return
    }

    if (e.key === 'ArrowLeft' && !e.altKey) {
      e.preventDefault()
      this.moveHorizontal('backward', e.shiftKey, usesCommandKey)
      return
    }

    if (e.key === 'ArrowRight' && !e.altKey) {
      e.preventDefault()
      this.moveHorizontal('forward', e.shiftKey, usesCommandKey)
      return
    }

    // Undo: Ctrl+Z / Cmd+Z
    if (key === 'z' && usesCommandKey && !e.shiftKey) {
      e.preventDefault()
      this.undo()
      return
    }

    // Redo: Ctrl+Y / Cmd+Y / Ctrl+Shift+Z / Cmd+Shift+Z
    if (
      (key === 'y' && usesCommandKey) ||
      (key === 'z' && usesCommandKey && e.shiftKey)
    ) {
      e.preventDefault()
      this.redo()
      return
    }

    // Bold: Ctrl+B / Cmd+B
    if (key === 'b' && usesCommandKey && !e.shiftKey) {
      e.preventDefault()
      this.toggleInline('**', '**', 'bold')
      return
    }

    // Italic: Ctrl+I / Cmd+I
    if (key === 'i' && usesCommandKey && !e.shiftKey) {
      e.preventDefault()
      this.toggleInline('*', '*', 'italic')
      return
    }

    // Underline: Ctrl+U / Cmd+U
    if (key === 'u' && usesCommandKey && !e.shiftKey) {
      e.preventDefault()
      this.toggleInline('<u>', '</u>', 'underline')
      return
    }

    // Strikethrough: Ctrl+Shift+X / Cmd+Shift+X
    if (key === 'x' && usesCommandKey && e.shiftKey) {
      e.preventDefault()
      this.toggleInline('~~', '~~', 'strikethrough')
      return
    }

    // Code inline: Ctrl+E / Cmd+E
    if (key === 'e' && usesCommandKey && !e.shiftKey) {
      e.preventDefault()
      this.toggleInline('`', '`', 'code')
      return
    }

    // Link: Ctrl+K / Cmd+K
    if (key === 'k' && usesCommandKey && !e.shiftKey) {
      e.preventDefault()
      this.insertTemplate('[link text](url)')
      return
    }

    // Code block: Ctrl+Shift+K / Cmd+Shift+K
    if (key === 'k' && usesCommandKey && e.shiftKey) {
      e.preventDefault()
      this.insertTemplate('```\ncode\n```')
      return
    }

    // Blockquote: Ctrl+Shift+Q / Cmd+Shift+Q
    if (key === 'q' && usesCommandKey && e.shiftKey) {
      e.preventDefault()
      this.toggleBlock('> ')
      return
    }

    // Ordered list: Ctrl+Shift+O / Cmd+Shift+O
    if (key === 'o' && usesCommandKey && e.shiftKey) {
      e.preventDefault()
      this.toggleBlock('1. ')
      return
    }

    // Unordered list: Ctrl+Shift+U / Cmd+Shift+U
    if (key === 'u' && usesCommandKey && e.shiftKey) {
      e.preventDefault()
      this.toggleBlock('- ')
      return
    }

    // Horizontal rule: Ctrl+Shift+H / Cmd+Shift+H
    if (key === 'h' && usesCommandKey && e.shiftKey) {
      e.preventDefault()
      this.insertTemplate('\n---\n')
      return
    }
  }

  protected onMouseDown(e: MouseEvent): void {
    if (this.viewMode !== 'hybrid') return
    const target = e.target as Node
    const lineEl = this.lineOf(target)
    if (!lineEl || lineEl.classList.contains('focused')) return

    const corrected = this.hybrid.correctClick(this.root, lineEl, e)
    if (corrected) {
      requestAnimationFrame(() => {
        this.restoreCursor(corrected)
      })
    }
  }

  protected onSelectionChange(): void {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !this.root.contains(sel.anchorNode)) return
    const shouldKeepCaretSafe = sel.isCollapsed

    const el = this.lineOf(sel.getRangeAt(0).startContainer)
    const idx = el ? parseInt(el.dataset.line || '-1') : -1

    // If cursor is still within the same focused block, just update focusedLine
    if (this.focusedBlockRange && idx >= this.focusedBlockRange[0] && idx < this.focusedBlockRange[1]) {
      this.focusedLine = idx
      if (shouldKeepCaretSafe) this.queueCaretScrollIntoView()
      return
    }

    if (idx !== this.focusedLine) {
      const oldFocused = this.focusedLine
      // Remove .focused from ALL previously focused lines
      this.root.querySelectorAll('.live-line.focused').forEach(l => l.classList.remove('focused'))

      // Determine block range for the new line
      let blockRange: [number, number] | null = null
      if (idx >= 0 && this.prevParsed[idx] && LiveEditor.isMultiLineBlockType(this.prevParsed[idx].blockType)) {
        blockRange = this.findBlockRange(this.prevParsed, idx)
      }

      if (blockRange) {
        // Add .focused to all lines in the block
        for (let i = blockRange[0]; i < blockRange[1]; i++) {
          const lineEl = this.root.querySelector(`[data-line="${i}"]`)
          if (lineEl) lineEl.classList.add('focused')
        }
      } else if (el) {
        el.classList.add('focused')
      }

      const oldBlockRange = this.focusedBlockRange
      this.focusedLine = idx
      this.focusedBlockRange = blockRange

      if (this.viewMode === 'hybrid') {
        this.hybrid.onFocusChange(this.root, oldFocused, idx, blockRange ?? undefined)
      }

      this.onBlockFocusChange(oldBlockRange, blockRange)
    }

    if (shouldKeepCaretSafe) this.queueCaretScrollIntoView()
  }

  /** Called when block focus changes — override in subclass to react */
  protected onBlockFocusChange(_oldRange: [number, number] | null, _newRange: [number, number] | null): void {
    // Override in LiveEditorPlus
  }

  // ---------------------------------------------------------------------------
  // Text extraction
  // ---------------------------------------------------------------------------

  protected readLines(): void {
    const children = this.root.childNodes
    if (children.length === 0) { this.lines = ['']; return }

    const out: string[] = []
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) {
        out.push(...this.normalizeInputText(child.textContent || '').split('\n'))
      } else if (child.nodeType === Node.COMMENT_NODE) {
        const match = /^veloxmd-visual-line:(\d+)$/.exec((child as Comment).data)
        if (match) out.push(this.lines[Number(match[1])] ?? '')
      } else if (child instanceof HTMLElement) {
        if (child.contentEditable === 'false') continue
        const text = child.tagName === 'BR' ? '' : this.readLineText(child).replace(/\r/g, '')
        out.push(...this.normalizeInputText(text).split('\n'))
      }
    }
    if (out.length === 0) out.push('')
    this.lines = out
  }

  /** Read text content of a line element, excluding non-editable decorations */
  private readLineText(el: HTMLElement): string {
    if (el.classList.contains('veloxmd-visual-source-hidden')) {
      const line = Number(el.dataset.line)
      if (Number.isInteger(line) && line >= 0) return this.lines[line] ?? ''
    }

    if (
      el.childNodes.length === 1
      && el.firstChild instanceof HTMLElement
      && el.firstChild.tagName === 'BR'
    ) return ''

    let text = ''
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || ''
      } else if (node instanceof HTMLElement) {
        if (node.classList.contains('live-citation') && node.dataset.raw) {
          text += node.dataset.raw
          continue
        }
        if (node.contentEditable === 'false') continue
        text += node.tagName === 'BR' ? '\n' : node.textContent || ''
      }
    }
    return text
  }

  // ---------------------------------------------------------------------------
  // Cursor save / restore
  // ---------------------------------------------------------------------------

  protected saveCursor(): { line: number; offset: number } | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)

    // Find the direct child of root that contains the cursor
    let node: Node | null = range.startContainer
    while (node && node.parentNode !== this.root) {
      node = node.parentNode
    }
    if (!node) return null

    // Use child index as line number — data-line can be stale (cloned by browser on Enter)
    let idx = 0
    let sibling: ChildNode | null = this.root.firstChild
    while (sibling && sibling !== node) { sibling = sibling.nextSibling; idx++ }
    if (!sibling) return null

    return { line: idx, offset: getFlatOffset(node, range.startContainer, range.startOffset) }
  }

  protected restoreCursor(c: { line: number; offset: number }): void {
    const el = this.root.querySelector(`[data-line="${c.line}"]`)
    if (!el) return
    const pos = setFlatOffset(el, c.offset)
    if (!pos) return
    const sel = window.getSelection()
    if (!sel) return
    try {
      const range = document.createRange()
      range.setStart(pos.node, pos.offset)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      this.queueCaretScrollIntoView()
    } catch { /* best-effort */ }
  }

  private queueCaretScrollIntoView(): void {
    if (this.caretScrollFrame !== null) cancelAnimationFrame(this.caretScrollFrame)
    this.caretScrollFrame = requestAnimationFrame(() => {
      this.caretScrollFrame = null
      this.scrollCaretIntoView()
    })
  }

  private scrollCaretIntoView(): void {
    const selection = this.saveSelection()
    if (!selection) return

    const line = this.root.querySelector<HTMLElement>(`[data-line="${selection.focus.line}"]`)
    if (!line) return

    const scroller = this.scrollContainerFor(line)
    if (!scroller) return

    const lineRect = line.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    const viewportHeight = Math.max(0, scrollerRect.height)
    const topMargin = Math.max(
      CARET_SCROLL_TOP_MIN_MARGIN,
      Math.min(CARET_SCROLL_TOP_MAX_MARGIN, viewportHeight * CARET_SCROLL_TOP_RATIO),
    )
    const bottomMargin = Math.max(
      CARET_SCROLL_BOTTOM_MIN_MARGIN,
      Math.min(CARET_SCROLL_BOTTOM_MAX_MARGIN, viewportHeight * CARET_SCROLL_BOTTOM_RATIO),
    )
    const visibleTop = scrollerRect.top + topMargin
    const visibleBottom = scrollerRect.bottom - bottomMargin

    let targetTop = scroller.scrollTop
    if (lineRect.bottom > visibleBottom) {
      targetTop += lineRect.bottom - visibleBottom
    } else if (lineRect.top < visibleTop) {
      targetTop -= visibleTop - lineRect.top
    }

    this.animateScrollTop(scroller, targetTop)
  }

  private animateScrollTop(scroller: HTMLElement, targetTop: number): void {
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const startTop = scroller.scrollTop
    const nextTop = Math.max(0, Math.min(maxTop, targetTop))
    const delta = nextTop - startTop

    if (this.caretScrollAnimationFrame !== null) {
      cancelAnimationFrame(this.caretScrollAnimationFrame)
      this.caretScrollAnimationFrame = null
    }

    if (Math.abs(delta) <= CARET_SCROLL_SNAP_PX) {
      scroller.scrollTop = nextTop
      return
    }

    let startTime: number | null = null
    const step = (now: number) => {
      if (startTime === null) startTime = now
      const elapsed = Math.max(0, now - startTime)
      const progress = Math.min(1, elapsed / CARET_SCROLL_ANIMATION_MS)
      const eased = 1 - Math.pow(1 - progress, 3)

      scroller.scrollTop = startTop + delta * eased

      if (progress < 1) {
        this.caretScrollAnimationFrame = requestAnimationFrame(step)
        return
      }

      this.caretScrollAnimationFrame = null
      scroller.scrollTop = nextTop
    }

    this.caretScrollAnimationFrame = requestAnimationFrame(step)
  }

  private scrollContainerFor(element: HTMLElement): HTMLElement | null {
    let current = element.parentElement
    while (current) {
      const style = window.getComputedStyle(current)
      if (
        SCROLLABLE_OVERFLOW.test(style.overflowY)
        && current.scrollHeight > current.clientHeight
      ) {
        return current
      }
      current = current.parentElement
    }

    const scrollingElement = document.scrollingElement
    return scrollingElement instanceof HTMLElement ? scrollingElement : null
  }

  protected lineOf(node: Node): HTMLElement | null {
    let n: Node | null = node
    while (n && n !== this.root) {
      if (n instanceof HTMLElement && n.dataset.line !== undefined) return n
      n = n.parentNode
    }
    return null
  }

  // ---------------------------------------------------------------------------
  // Internal cursor / offset utilities
  // ---------------------------------------------------------------------------

  private _rangeEndpointToLineOffset(
    node: Node,
    domOffset: number
  ): { line: number; offset: number } | null {
    if (!this.root.contains(node)) return null

    if (node === this.root) {
      if (this.root.childNodes.length === 0) return { line: 0, offset: 0 }
      if (domOffset >= this.root.childNodes.length) {
        const last = this.lines.length - 1
        return { line: last, offset: this.lines[last]?.length ?? 0 }
      }
      return { line: Math.max(0, domOffset), offset: 0 }
    }

    let lineNode: Node | null = node
    while (lineNode && lineNode.parentNode !== this.root) lineNode = lineNode.parentNode
    if (!lineNode) return null

    let lineIdx = 0
    let sibling: ChildNode | null = this.root.firstChild
    while (sibling && sibling !== lineNode) { sibling = sibling.nextSibling; lineIdx++ }
    if (!sibling) return null

    return { line: lineIdx, offset: getFlatOffset(lineNode, node, domOffset) }
  }

  protected _lineOffsetToFlat(line: number, offset: number): number | null {
    if (this.lines.length === 0) return 0
    if (line < 0 || line >= this.lines.length) return null
    let flat = 0
    for (let i = 0; i < line; i++) flat += this.lines[i].length + 1
    flat += Math.min(offset, this.lines[line].length)
    return flat
  }

  protected _flatToLineOffset(flat: number): { line: number; offset: number } | null {
    if (this.lines.length === 0) return { line: 0, offset: 0 }
    let remaining = Math.max(0, flat)
    for (let i = 0; i < this.lines.length; i++) {
      const lineLen = this.lines[i].length
      if (remaining <= lineLen) return { line: i, offset: remaining }
      remaining -= lineLen + 1
    }
    const lastLine = this.lines.length - 1
    return { line: lastLine, offset: this.lines[lastLine].length }
  }

  protected _restoreCursorRange(
    startPos: { line: number; offset: number },
    endPos: { line: number; offset: number }
  ): void {
    const startEl = this.root.querySelector(`[data-line="${startPos.line}"]`)
    const endEl = this.root.querySelector(`[data-line="${endPos.line}"]`)
    if (!startEl || !endEl) return

    const startDom = setFlatOffset(startEl, startPos.offset)
    const endDom = setFlatOffset(endEl, endPos.offset)
    if (!startDom || !endDom) return

    const sel = window.getSelection()
    if (!sel) return
    try {
      const range = document.createRange()
      range.setStart(startDom.node, startDom.offset)
      range.setEnd(endDom.node, endDom.offset)
      sel.removeAllRanges()
      sel.addRange(range)
    } catch { /* best-effort */ }
  }

  // ---------------------------------------------------------------------------
  // Incremental render
  // ---------------------------------------------------------------------------

  protected onIncrementalRender(_startIdx: number, _endIdx: number): void {
    // Override in LiveEditorPlus to handle details blocks for the affected range
  }

  private isLineFocused(i: number): boolean {
    if (this.focusedBlockRange) {
      return i >= this.focusedBlockRange[0] && i < this.focusedBlockRange[1]
    }
    return i === this.focusedLine
  }

  private static isMultiLineBlockType(bt: string): boolean {
    if (isTableBlockType(bt)) return true
    switch (bt) {
      case 'code-block-open':
      case 'code-block-line':
      case 'code-block-close':
      case 'details-open':
      case 'details-summary':
      case 'details-close':
        return true
      default:
        return false
    }
  }

  private findBlockRange(parsed: LiveLine[], lineIdx: number): [number, number] {
    const bt = parsed[lineIdx].blockType

    if (!LiveEditor.isMultiLineBlockType(bt)) {
      return [lineIdx, lineIdx + 1]
    }

    if (bt === 'code-block-open' || bt === 'code-block-line' || bt === 'code-block-close') {
      let start = lineIdx
      while (start > 0 && parsed[start].blockType !== 'code-block-open') start--
      let end = lineIdx
      while (end < parsed.length - 1 && parsed[end].blockType !== 'code-block-close') end++
      return [start, end + 1]
    }

    const tableRange = findTableBlockRange(parsed, lineIdx)
    if (tableRange) return tableRange

    if (bt === 'details-open' || bt === 'details-summary' || bt === 'details-close') {
      let start = lineIdx
      while (start > 0 && parsed[start].blockType !== 'details-open') start--
      let end = lineIdx
      while (end < parsed.length - 1 && parsed[end].blockType !== 'details-close') end++
      return [start, end + 1]
    }

    return [lineIdx, lineIdx + 1]
  }

  private renderIncremental(): boolean {
    const oldLines = this.prevLines
    const newLines = this.lines
    const oldLen = oldLines.length
    const newLen = newLines.length

    // Line count changed — browser modified DOM structure (Enter/Delete),
    // DOM child indices and old line indices are out of sync, fallback
    if (oldLen !== newLen) return false

    // Find first differing line
    let topDiff = 0
    while (topDiff < oldLen && oldLines[topDiff] === newLines[topDiff]) topDiff++

    if (topDiff === oldLen) return true

    // Find last differing line
    let botDiff = oldLen - 1
    while (botDiff > topDiff && oldLines[botDiff] === newLines[botDiff]) botDiff--

    // Parse full document for correct block context
    const newParsed = this.parseDocument(newLines)

    const oldParsed = this.prevParsed
    if (oldParsed.length !== oldLen) return false

    // Verify block types unchanged outside the diff range
    for (let i = 0; i < topDiff; i++) {
      if (newParsed[i].blockType !== oldParsed[i].blockType) return false
    }
    for (let i = botDiff + 1; i < oldLen; i++) {
      if (newParsed[i].blockType !== oldParsed[i].blockType) return false
    }

    // Expand changed range to full block boundaries
    let blockStart = topDiff
    let blockEnd = botDiff + 1
    for (let i = topDiff; i <= botDiff; i++) {
      const [bs, be] = this.findBlockRange(newParsed, i)
      if (bs < blockStart) blockStart = bs
      if (be > blockEnd) blockEnd = be
    }
    for (let i = topDiff; i <= botDiff; i++) {
      if (i < oldParsed.length) {
        const [bs, be] = this.findBlockRange(oldParsed, i)
        if (bs < blockStart) blockStart = bs
        if (be > blockEnd) blockEnd = be
      }
    }

    blockStart = Math.max(0, blockStart)
    blockEnd = Math.min(newParsed.length, blockEnd)

    // Build new DOM nodes for the block range
    this.rendering = true
    const frag = document.createDocumentFragment()
    for (let i = blockStart; i < blockEnd; i++) {
      const el = this.renderLine(newParsed[i], i)
      if (this.isLineFocused(i)) el.classList.add('focused')
      frag.appendChild(el)
    }

    this.runWithMutationSyncSuppressed(() => {
      // Remove old DOM children in the range and insert new ones
      const children = this.root.childNodes
      const swapCount = blockEnd - blockStart
      for (let r = 0; r < swapCount; r++) {
        if (blockStart < children.length) {
          this.root.removeChild(children[blockStart])
        }
      }
      const refNode = children[blockStart] || null
      this.root.insertBefore(frag, refNode)
    })

    if (this.viewMode === 'hybrid') {
      this.hybrid.annotateBlockWidths(this.root, blockStart, blockEnd)
    }

    this.prevLines = [...newLines]
    this.prevParsed = newParsed

    this.onIncrementalRender(blockStart, blockEnd)

    this.rendering = false
    return true
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  protected renderAll(): void {
    this.rendering = true
    const parsed = this.parseDocument(this.lines)
    const frag = document.createDocumentFragment()

    for (let i = 0; i < parsed.length; i++) {
      const el = this.renderLine(parsed[i], i)
      if (this.isLineFocused(i)) el.classList.add('focused')
      frag.appendChild(el)
    }

    this.runWithMutationSyncSuppressed(() => {
      this.root.innerHTML = ''
      this.root.appendChild(frag)
    })
    if (this.viewMode === 'hybrid') {
      if (this.focusedBlockRange) {
        this.hybrid.annotateBlockWidths(this.root, this.focusedBlockRange[0], this.focusedBlockRange[1])
      } else if (this.focusedLine >= 0) {
        this.hybrid.annotateBlockWidths(this.root, this.focusedLine, this.focusedLine + 1)
      }
    }

    this.prevLines = [...this.lines]
    this.prevParsed = parsed

    this.rendering = false
  }
}
