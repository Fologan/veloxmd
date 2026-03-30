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

interface Snapshot {
  lines: string[]
  text: string
  cursor: { line: number; offset: number } | null
}

const MAX_HISTORY = 200
const MERGE_WINDOW = 400 // ms — consecutive typing merges into one undo entry

export class LiveEditor {
  protected root: HTMLDivElement
  protected lines: string[] = ['']
  protected rendering = false
  protected focusedLine = -1
  protected viewMode: ViewMode = 'live'
  private hybrid = new HybridController()
  private boundSelectionChange = () => this.onSelectionChange()

  // Undo / redo stacks
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private lastSnapshotTime = 0
  private pendingSnapshot: Snapshot | null = null

  constructor(container: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'live-editor'
    this.root.contentEditable = 'true'
    this.root.spellcheck = false
    this.root.setAttribute('data-placeholder', 'Start typing markdown\u2026')
    container.appendChild(this.root)

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
    document.removeEventListener('selectionchange', this.boundSelectionChange)
    this.root.remove()
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

  protected undo(): void {
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

  protected redo(): void {
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

  protected onInput(): void {
    if (this.rendering) return
    const cursor = this.saveCursor()
    this.readLines()
    this.recordChange()
    this.renderAll()
    if (cursor) this.restoreCursor(cursor)
  }

  protected onPaste(e: ClipboardEvent): void {
    e.preventDefault()
    const pastedText = e.clipboardData?.getData('text/plain') || ''
    if (!pastedText) return

    this.pushSnapshot() // save state before paste

    // Calculate cursor position in the full text
    const cursor = this.saveCursor()
    if (!cursor) {
      // No cursor — just append
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

    // Insert pasted text into the model
    const fullText = this.getValue()
    const newText = fullText.slice(0, charsBefore) + pastedText + fullText.slice(charsBefore)
    this.lines = newText.split('\n')

    // Calculate new cursor position (end of pasted text)
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

    if (idx !== this.focusedLine) {
      const oldFocused = this.focusedLine
      this.root.querySelector('.live-line.focused')?.classList.remove('focused')
      el?.classList.add('focused')
      this.focusedLine = idx
      if (this.viewMode === 'hybrid') {
        this.hybrid.onFocusChange(this.root, oldFocused, idx)
      }
    }
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
        out.push(child.tagName === 'BR' ? '' : (child.textContent || ''))
      }
    }
    if (out.length === 0) out.push('')
    this.lines = out
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
  // Render
  // ---------------------------------------------------------------------------

  protected renderAll(): void {
    this.rendering = true
    const parsed = this.parseDocument(this.lines)
    const frag = document.createDocumentFragment()

    for (let i = 0; i < parsed.length; i++) {
      const el = this.renderLine(parsed[i], i)
      if (i === this.focusedLine) el.classList.add('focused')
      frag.appendChild(el)
    }

    this.root.innerHTML = ''
    this.root.appendChild(frag)
    if (this.viewMode === 'hybrid') {
      this.hybrid.annotateWidths(this.root)
    }
    this.rendering = false
  }
}
