// =============================================================================
// HybridController — canvas-based syntax measurement & click correction
//
// Measures text widths via canvas.measureText() instead of triggering DOM
// reflow. This enables smooth CSS transitions (explicit px widths) and
// correct cursor placement on collapsed lines.
// =============================================================================

/** Block classes where syntax should NOT collapse */
const EXEMPT_CLASSES = ['live-code-fence', 'live-code-line', 'live-hr', 'live-table-separator']

/** Font-size multipliers for syntax spans inside heading blocks */
const HEADING_SYNTAX_SCALE: Record<string, number> = {
  'live-h1': 0.55 * 2,    // font-size: 0.55em inside 2em heading
  'live-h2': 0.55 * 1.5,
  'live-h3': 0.55 * 1.25,
}

export class HybridController {
  private ctx: CanvasRenderingContext2D
  private widthCache = new Map<string, number>()
  private baseFont = ''
  private baseFontSize = 16

  constructor() {
    const canvas = document.createElement('canvas')
    this.ctx = canvas.getContext('2d')!
  }

  /** Invalidate cached measurements (call on theme/zoom change) */
  invalidate(): void {
    this.widthCache.clear()
    this.baseFont = ''
  }

  // ---------------------------------------------------------------------------
  // Width annotation — called after renderAll()
  // ---------------------------------------------------------------------------

  /** Set explicit px widths on all .syntax spans so CSS can transition them */
  annotateWidths(root: HTMLElement): void {
    this.resolveBaseFont(root)
    const lines = root.querySelectorAll('.live-line') as NodeListOf<HTMLElement>
    for (const el of lines) this.annotateLineWidths(el)
  }

  /** Annotate widths only for lines in [startLine, endLine) */
  annotateBlockWidths(root: HTMLElement, startLine: number, endLine: number): void {
    this.resolveBaseFont(root)
    for (let i = startLine; i < endLine; i++) {
      const el = root.querySelector(`[data-line="${i}"]`) as HTMLElement | null
      if (el) this.annotateLineWidths(el)
    }
  }

  // ---------------------------------------------------------------------------
  // Focus change — ensure widths are set for smooth transition
  // ---------------------------------------------------------------------------

  onFocusChange(root: HTMLElement, _oldIdx: number, newIdx: number): void {
    if (newIdx < 0) return
    this.resolveBaseFont(root)
    const newLine = root.querySelector(`[data-line="${newIdx}"]`) as HTMLElement | null
    if (newLine) this.annotateLineWidths(newLine)
  }

  private annotateLineWidths(lineEl: HTMLElement): void {
    if (EXEMPT_CLASSES.some(c => lineEl.classList.contains(c))) return
    const font = this.getEffectiveFont(lineEl)
    const spans = lineEl.querySelectorAll('.syntax') as NodeListOf<HTMLElement>
    for (const span of spans) {
      const text = span.textContent || ''
      if (!text) continue
      span.style.width = this.measureText(text, font) + 'px'
    }
  }

  // ---------------------------------------------------------------------------
  // Click correction — map visual click position to correct flat offset
  // ---------------------------------------------------------------------------

  /**
   * When the user clicks on a collapsed (unfocused) line, syntax spans are
   * 0-width. The browser places the cursor based on the collapsed layout,
   * but once the line expands, the cursor may be wrong. This method computes
   * the correct {line, offset} in the expanded layout.
   */
  correctClick(
    root: HTMLElement,
    lineEl: HTMLElement,
    event: MouseEvent,
  ): { line: number; offset: number } | null {
    // Skip exempt lines — their syntax is always visible
    if (EXEMPT_CLASSES.some(c => lineEl.classList.contains(c))) return null

    this.resolveBaseFont(root)

    const lineIdx = parseInt(lineEl.dataset.line || '-1')
    if (lineIdx < 0) return null

    const clickX = event.clientX - lineEl.getBoundingClientRect().left

    // Walk child nodes of the line, building a map of visual position → flat offset.
    // Syntax spans are 0-width in collapsed state, so skip their visual width
    // but count their characters for the flat offset.
    const font = this.getEffectiveFont(lineEl)
    let visualX = 0
    let flatOffset = 0

    for (const child of lineEl.childNodes) {
      const text = child.textContent || ''
      if (!text) continue

      const isSyntax =
        child instanceof HTMLElement && child.classList.contains('syntax')

      if (isSyntax) {
        // Syntax is collapsed (0px visual width) — add chars to flat offset only
        flatOffset += text.length
        continue
      }

      // Visible node — measure character by character to find click position
      const nodeFont = this.getNodeFont(child, font)
      for (let i = 0; i < text.length; i++) {
        const charW = this.measureText(text[i], nodeFont)
        if (visualX + charW / 2 > clickX) {
          // Click is on this character
          return { line: lineIdx, offset: flatOffset }
        }
        visualX += charW
        flatOffset++
      }
    }

    // Click is past the end of the line
    return { line: lineIdx, offset: flatOffset }
  }

  // ---------------------------------------------------------------------------
  // Canvas measurement
  // ---------------------------------------------------------------------------

  private measureText(text: string, font: string): number {
    const key = font + '\0' + text
    let w = this.widthCache.get(key)
    if (w !== undefined) return w
    this.ctx.font = font
    w = this.ctx.measureText(text).width
    this.widthCache.set(key, w)
    return w
  }

  private resolveBaseFont(root: HTMLElement): void {
    if (this.baseFont) return
    const style = getComputedStyle(root)
    this.baseFontSize = parseFloat(style.fontSize) || 16
    this.baseFont = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  }

  private getEffectiveFont(lineEl: HTMLElement): string {
    // Check if this is a heading with scaled syntax
    for (const [cls, scale] of Object.entries(HEADING_SYNTAX_SCALE)) {
      if (lineEl.classList.contains(cls)) {
        const size = this.baseFontSize * scale
        return this.baseFont.replace(/[\d.]+px/, size + 'px')
      }
    }
    return this.baseFont
  }

  /** Get the effective font for a child node (bold, italic, etc.) */
  private getNodeFont(node: Node, lineFont: string): string {
    if (!(node instanceof HTMLElement)) return lineFont

    let font = lineFont
    const tag = node.tagName

    if (tag === 'STRONG' || tag === 'B') {
      font = font.replace(/\b(normal|[1-9]00)\b/, '700')
    }
    if (tag === 'EM' || tag === 'I') {
      font = font.replace(/^normal/, 'italic')
    }

    return font
  }
}
