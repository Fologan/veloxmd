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

interface Snapshot {
  lines: string[]
  text: string
  cursor: { line: number; offset: number } | null
}

const MAX_HISTORY = 200
const MERGE_WINDOW = 400 // ms — consecutive typing merges into one undo entry

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

  private prevLines: string[] = ['']
  private prevParsed: LiveLine[] = []

  // Undo / redo stacks
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private lastSnapshotTime = 0
  private pendingSnapshot: Snapshot | null = null

  constructor(container: HTMLElement, options?: EditorOptions) {
    this.wrapper = document.createElement('div')
    this.wrapper.className = 'veloxmd-wrapper'
    container.appendChild(this.wrapper)

    this.root = document.createElement('div')
    this.root.className = 'live-editor'
    this.root.contentEditable = 'true'
    this.root.spellcheck = false
    this.root.setAttribute('data-placeholder', options?.placeholder ?? 'Start typing markdown\u2026')
    this.wrapper.appendChild(this.root)

    if (options?.toolbar) this.toolbar = new Toolbar(this, this.wrapper)
    if (options?.onChange) this.changeCallback = options.onChange

    this.root.addEventListener('input', () => this.onInput())
    this.root.addEventListener('paste', (e) => this.onPaste(e))
    this.root.addEventListener('keydown', (e) => this.onKeyDown(e))
    this.root.addEventListener('mousedown', (e) => this.onMouseDown(e))
    document.addEventListener('selectionchange', this.boundSelectionChange)

    this.renderAll()
    this.root.focus()
    this.pushSnapshot() // initial empty state
  }

  destroy(): void {
    this.toolbar?.destroy()
    document.removeEventListener('selectionchange', this.boundSelectionChange)
    this.wrapper.remove()
  }

  setValue(text: string): void {
    this.pushSnapshot()
    this.lines = text.split('\n')
    this.renderAll()
    this.pushSnapshot()
    this.redoStack.length = 0
  }

  getValue(): string {
    return this.lines.join('\n')
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode
    if (mode === 'hybrid') {
      this.root.classList.add('hybrid-mode')
    } else {
      this.root.classList.remove('hybrid-mode')
    }
    this.renderAll()
  }

  getViewMode(): ViewMode {
    return this.viewMode
  }

  onChange(callback: (text: string) => void): void {
    this.changeCallback = callback
  }

  insert(text: string): void {
    const cursor = this.saveCursor()
    if (!cursor) return

    this.pushSnapshot()

    let charsBefore = 0
    for (let i = 0; i < cursor.line && i < this.lines.length; i++) {
      charsBefore += this.lines[i].length + 1
    }
    charsBefore += cursor.offset

    const fullText = this.getValue()
    this.lines = (fullText.slice(0, charsBefore) + text + fullText.slice(charsBefore)).split('\n')

    // Cursor after inserted text
    let remaining = charsBefore + text.length
    let newLine = 0
    for (let i = 0; i < this.lines.length; i++) {
      if (remaining <= this.lines[i].length) { newLine = i; break }
      remaining -= this.lines[i].length + 1
      newLine = i + 1
    }

    this.renderAll()
    this.restoreCursor({ line: newLine, offset: Math.max(0, remaining) })
    this.redoStack.length = 0
    this.emitChange()
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

  private snap(cursor?: { line: number; offset: number } | null): Snapshot {
    const lines = [...this.lines]
    return { lines, text: lines.join('\n'), cursor: cursor ?? this.saveCursor() }
  }

  private pushSnapshot(): void {
    const s = this.snap()
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
  }

  public redo(): void {
    const next = this.redoStack.pop()
    if (!next) return

    // Push current to undo
    this.undoStack.push(this.snap())
    this.pendingSnapshot = null
    this.applySnapshot(next)
  }

  private applySnapshot(s: Snapshot): void {
    this.lines = [...s.lines]
    this.renderAll()
    if (s.cursor) this.restoreCursor(s.cursor)
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  private emitChange(): void {
    if (this.changeCallback) this.changeCallback(this.getValue())
  }

  protected onInput(): void {
    if (this.rendering) return
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
    const pastedText = e.clipboardData?.getData('text/plain') || ''
    if (!pastedText) return

    this.pushSnapshot() // save state before paste

    const sel = window.getSelection()
    const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed

    if (hasSelection) {
      const range = sel.getRangeAt(0)
      if (this.root.contains(range.startContainer) && this.root.contains(range.endContainer)) {
        const startPos = this._rangeEndpointToLineOffset(range.startContainer, range.startOffset)
        const endPos = this._rangeEndpointToLineOffset(range.endContainer, range.endOffset)
        if (startPos && endPos) {
          const startFlat = this._lineOffsetToFlat(startPos.line, startPos.offset)
          const endFlat = this._lineOffsetToFlat(endPos.line, endPos.offset)
          if (startFlat !== null && endFlat !== null) {
            const flatStart = Math.min(startFlat, endFlat)
            const flatEnd = Math.max(startFlat, endFlat)
            const fullText = this.getValue()
            this.lines = (fullText.slice(0, flatStart) + pastedText + fullText.slice(flatEnd)).split('\n')

            let remaining = flatStart + pastedText.length
            let newLine = 0
            for (let i = 0; i < this.lines.length; i++) {
              if (remaining <= this.lines[i].length) { newLine = i; break }
              remaining -= this.lines[i].length + 1
              newLine = i + 1
            }

            this.renderAll()
            this.restoreCursor({ line: newLine, offset: Math.max(0, remaining) })
            this.redoStack.length = 0
            this.emitChange()
            return
          }
        }
      }
    }

    // No selection — insert at cursor
    const cursor = this.saveCursor()
    if (!cursor) {
      this.lines = (this.getValue() + pastedText).split('\n')
      this.renderAll()
      this.redoStack.length = 0
      return
    }

    let charsBefore = 0
    for (let i = 0; i < cursor.line && i < this.lines.length; i++) {
      charsBefore += this.lines[i].length + 1
    }
    charsBefore += cursor.offset

    const fullText = this.getValue()
    const newText = fullText.slice(0, charsBefore) + pastedText + fullText.slice(charsBefore)
    this.lines = newText.split('\n')

    let remaining = charsBefore + pastedText.length
    let newLine = 0
    for (let i = 0; i < this.lines.length; i++) {
      if (remaining <= this.lines[i].length) {
        newLine = i
        break
      }
      remaining -= this.lines[i].length + 1
      newLine = i + 1
    }

    this.renderAll()
    this.restoreCursor({ line: newLine, offset: Math.max(0, remaining) })
    this.redoStack.length = 0
    this.emitChange()
  }

  protected onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Tab') {
      e.preventDefault()
      document.execCommand('insertText', false, '  ')
      return
    }

    // Undo: Ctrl+Z / Cmd+Z
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      this.undo()
      return
    }

    // Redo: Ctrl+Y / Cmd+Y / Ctrl+Shift+Z / Cmd+Shift+Z
    if (
      (e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
      (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)
    ) {
      e.preventDefault()
      this.redo()
      return
    }

    // Bold: Ctrl+B / Cmd+B
    if (e.key === 'b' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      this.toggleInline('**', '**', 'bold')
      return
    }

    // Italic: Ctrl+I / Cmd+I
    if (e.key === 'i' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      this.toggleInline('*', '*', 'italic')
      return
    }

    // Underline: Ctrl+U / Cmd+U
    if (e.key === 'u' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      this.toggleInline('<u>', '</u>', 'underline')
      return
    }

    // Strikethrough: Ctrl+Shift+X / Cmd+Shift+X
    if (e.key === 'X' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault()
      this.toggleInline('~~', '~~', 'strikethrough')
      return
    }

    // Code inline: Ctrl+E / Cmd+E
    if (e.key === 'e' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      this.toggleInline('`', '`', 'code')
      return
    }

    // Link: Ctrl+K / Cmd+K
    if (e.key === 'k' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      this.insertTemplate('[link text](url)')
      return
    }

    // Code block: Ctrl+Shift+K / Cmd+Shift+K
    if (e.key === 'K' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault()
      this.insertTemplate('```\ncode\n```')
      return
    }

    // Blockquote: Ctrl+Shift+Q / Cmd+Shift+Q
    if (e.key === 'Q' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault()
      this.toggleBlock('> ')
      return
    }

    // Ordered list: Ctrl+Shift+O / Cmd+Shift+O
    if (e.key === 'O' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault()
      this.toggleBlock('1. ')
      return
    }

    // Unordered list: Ctrl+Shift+U / Cmd+Shift+U
    if (e.key === 'U' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault()
      this.toggleBlock('- ')
      return
    }

    // Horizontal rule: Ctrl+Shift+H / Cmd+Shift+H
    if (e.key === 'H' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
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

    const el = this.lineOf(sel.getRangeAt(0).startContainer)
    const idx = el ? parseInt(el.dataset.line || '-1') : -1

    // If cursor is still within the same focused block, just update focusedLine
    if (this.focusedBlockRange && idx >= this.focusedBlockRange[0] && idx < this.focusedBlockRange[1]) {
      this.focusedLine = idx
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
        out.push(...(child.textContent || '').split('\n'))
      } else if (child instanceof HTMLElement) {
        out.push(child.tagName === 'BR' ? '' : this.readLineText(child))
      }
    }
    if (out.length === 0) out.push('')
    this.lines = out
  }

  /** Read text content of a line element, excluding non-editable decorations */
  private readLineText(el: HTMLElement): string {
    let text = ''
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || ''
      } else if (node instanceof HTMLElement) {
        if (node.contentEditable === 'false') continue
        text += node.textContent || ''
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
    } catch { /* best-effort */ }
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
    switch (bt) {
      case 'code-block-open':
      case 'code-block-line':
      case 'code-block-close':
      case 'table-header':
      case 'table-separator':
      case 'table-row':
      case 'details-open':
      case 'details-summary':
      case 'details-close':
        return true
      default:
        return false
    }
  }

  private static isTableType(bt: string): boolean {
    return bt === 'table-header' || bt === 'table-separator' || bt === 'table-row'
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

    if (bt === 'table-header' || bt === 'table-separator' || bt === 'table-row') {
      let start = lineIdx
      while (start > 0 && LiveEditor.isTableType(parsed[start - 1].blockType)) start--
      let end = lineIdx
      while (end < parsed.length - 1 && LiveEditor.isTableType(parsed[end + 1].blockType)) end++
      return [start, end + 1]
    }

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

    this.root.innerHTML = ''
    this.root.appendChild(frag)
    if (this.viewMode === 'hybrid') {
      this.hybrid.annotateWidths(this.root)
    }

    this.prevLines = [...this.lines]
    this.prevParsed = parsed

    this.rendering = false
  }
}
