// =============================================================================
// TableToolbar — Floating toolbar for table editing actions
// =============================================================================

import type { TableAlign } from './table-engine.js'

export type TableAction =
  | { type: 'add-row' }
  | { type: 'add-col' }
  | { type: 'delete-row' }
  | { type: 'delete-col' }
  | { type: 'sort-asc' }
  | { type: 'sort-desc' }
  | { type: 'set-align'; col: number; align: TableAlign }
  | { type: 'copy' }

// Button config: [action, label, title, accent?]
type BtnCfg = [string, string, string, string?]

const ADD_BTNS: BtnCfg[] = [
  ['add-row',    '+ Row', 'Add row below'],
  ['add-col',    '+ Col', 'Add column after'],
]

const DEL_BTNS: BtnCfg[] = [
  ['delete-row', '- Row', 'Delete current row'],
  ['delete-col', '- Col', 'Delete current column'],
]

const SORT_BTNS: BtnCfg[] = [
  ['sort-asc',  'A\u2191', 'Sort column ascending'],
  ['sort-desc', 'Z\u2193', 'Sort column descending'],
]

const ALIGN_OPTIONS: { value: TableAlign; label: string }[] = [
  { value: 'left',    label: 'L' },
  { value: 'center',  label: 'C' },
  { value: 'right',   label: 'R' },
  { value: 'justify', label: 'J' },
]

// ---------------------------------------------------------------------------
// Style injection (once per document)
// ---------------------------------------------------------------------------

let styleInjected = false

function injectStyles(): void {
  if (styleInjected) return
  styleInjected = true

  const css = `
/* FastMD Table Toolbar — floating bar */
.fastmd-table-toolbar {
  position: absolute;
  z-index: 900;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  background: var(--fastmd-toolbar-bg, #ffffff);
  border: 1px solid var(--fastmd-toolbar-border, #e1e4e8);
  border-radius: var(--fastmd-toolbar-radius, 6px);
  box-shadow: var(--fastmd-toolbar-dropdown-shadow, 0 2px 8px rgba(0,0,0,0.12));
  padding: 4px 6px;
  gap: 2px;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  pointer-events: auto;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.fastmd-table-toolbar.visible {
  opacity: 1;
  transform: translateY(0);
}

/* Groups */
.fastmd-table-toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

/* Separator */
.fastmd-table-toolbar-sep {
  width: 1px;
  height: 18px;
  background: var(--fastmd-toolbar-separator, #d1d5da);
  margin: 0 4px;
  flex-shrink: 0;
}

/* Buttons */
.fastmd-table-toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 26px;
  padding: 0 6px;
  border: none;
  background: transparent;
  color: var(--fastmd-toolbar-text, #24292e);
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  transition: background 0.12s ease;
}

.fastmd-table-toolbar-btn:hover {
  background: var(--fastmd-toolbar-button-hover, #f0f1f3);
}

.fastmd-table-toolbar-btn:active {
  background: var(--fastmd-toolbar-button-active, #e1e4e8);
}

.fastmd-table-toolbar-btn.add {
  color: var(--fastmd-green, #1a7f37);
}

.fastmd-table-toolbar-btn.destructive {
  color: var(--fastmd-red, #cf222e);
}

.fastmd-table-toolbar-btn.copy {
  color: var(--fastmd-orange, #bc4c00);
}

/* Alignment select */
.fastmd-table-toolbar-align {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.fastmd-table-toolbar-align-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--fastmd-text-muted, #636c76);
  margin-right: 2px;
}

.fastmd-table-toolbar-align select {
  height: 24px;
  padding: 0 2px;
  border: 1px solid var(--fastmd-toolbar-border, #e1e4e8);
  border-radius: 4px;
  background: var(--fastmd-toolbar-bg, #ffffff);
  color: var(--fastmd-toolbar-text, #24292e);
  font-size: 11px;
  cursor: pointer;
  min-width: 36px;
}

.fastmd-table-toolbar-align select:focus-visible {
  outline: 2px solid var(--fastmd-accent, #0969da);
  outline-offset: 1px;
}

/* Cell indicator */
.fastmd-table-toolbar-cell {
  font-size: 11px;
  font-weight: 600;
  color: var(--fastmd-text-muted, #636c76);
  padding: 0 6px;
  white-space: nowrap;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .fastmd-table-toolbar {
    transition: none;
  }
  .fastmd-table-toolbar-btn {
    transition: none;
  }
}

/* Print */
@media print {
  .fastmd-table-toolbar {
    display: none !important;
  }
}
`

  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
}

// ---------------------------------------------------------------------------
// TableToolbar class
// ---------------------------------------------------------------------------

export class TableToolbar {
  private el: HTMLElement
  private cellIndicator: HTMLElement
  private alignContainer: HTMLElement
  private actionCb: ((action: TableAction) => void) | null = null
  private offOutside: (e: MouseEvent) => void
  private alignSelects: HTMLSelectElement[] = []

  constructor(private container: HTMLElement) {
    injectStyles()

    const el = document.createElement('div')
    el.className = 'fastmd-table-toolbar'
    el.setAttribute('role', 'toolbar')
    el.setAttribute('aria-label', 'Table editing toolbar')

    // Build toolbar HTML
    el.innerHTML = this.buildHTML()
    container.appendChild(el)
    this.el = el

    this.cellIndicator = el.querySelector('.fastmd-table-toolbar-cell')!
    this.alignContainer = el.querySelector('.fastmd-table-toolbar-align')!

    // Delegated event handler — preventDefault keeps editor focus
    el.addEventListener('mousedown', this.onMouseDown)

    // Handle alignment select changes
    el.addEventListener('change', this.onChange)

    // Close on outside click (hide toolbar)
    this.offOutside = (e: MouseEvent) => {
      if (!el.contains(e.target as Node) && el.classList.contains('visible')) {
        // Don't auto-hide — let the editor control visibility
      }
    }
    document.addEventListener('mousedown', this.offOutside, true)
  }

  // ---- Public API ----

  show(rect: DOMRect): void {
    const el = this.el
    const containerRect = this.container.getBoundingClientRect()

    // Position above the table by default
    let top = rect.top - containerRect.top - el.offsetHeight - 6
    let left = rect.left - containerRect.left

    // If not enough room above, place below the table
    if (top < 0) {
      top = rect.bottom - containerRect.top + 6
    }

    // Clamp left so toolbar doesn't overflow container
    const maxLeft = this.container.clientWidth - el.offsetWidth - 4
    if (left > maxLeft) left = Math.max(0, maxLeft)

    el.style.top = `${top}px`
    el.style.left = `${left}px`
    el.classList.add('visible')
  }

  hide(): void {
    this.el.classList.remove('visible')
  }

  onAction(callback: (action: TableAction) => void): void {
    this.actionCb = callback
  }

  updateCell(row: number, col: number, totalRows: number, totalCols: number): void {
    const rowLabel = row === 0 ? 'H' : `R${row}`
    const colLabel = `C${col + 1}`
    this.cellIndicator.textContent = `${rowLabel} ${colLabel}`
    this.cellIndicator.title = `Row ${row === 0 ? 'Header' : row}/${totalRows}, Col ${col + 1}/${totalCols}`
  }

  updateAlignments(alignments: TableAlign[]): void {
    const container = this.alignContainer
    // Keep the label, rebuild selects
    const label = container.querySelector('.fastmd-table-toolbar-align-label')
    container.innerHTML = ''
    if (label) container.appendChild(label)
    else {
      const lbl = document.createElement('span')
      lbl.className = 'fastmd-table-toolbar-align-label'
      lbl.textContent = 'Align:'
      container.appendChild(lbl)
    }

    this.alignSelects = []

    alignments.forEach((align, i) => {
      const select = document.createElement('select')
      select.dataset.col = String(i)
      select.title = `Column ${i + 1} alignment`
      select.setAttribute('aria-label', `Column ${i + 1} alignment`)

      for (const opt of ALIGN_OPTIONS) {
        const option = document.createElement('option')
        option.value = opt.value
        option.textContent = opt.label
        if (opt.value === align) option.selected = true
        select.appendChild(option)
      }

      container.appendChild(select)
      this.alignSelects.push(select)
    })
  }

  destroy(): void {
    document.removeEventListener('mousedown', this.offOutside, true)
    this.el.removeEventListener('mousedown', this.onMouseDown)
    this.el.removeEventListener('change', this.onChange)
    this.el.remove()
    this.actionCb = null
  }

  // ---- Private ----

  private buildHTML(): string {
    let html = ''

    // Add buttons (green)
    html += '<div class="fastmd-table-toolbar-group">'
    for (const [action, label, title] of ADD_BTNS) {
      html += `<button class="fastmd-table-toolbar-btn add" data-action="${action}" title="${title}" aria-label="${title}">${label}</button>`
    }
    html += '</div>'

    // Delete buttons (red)
    html += '<div class="fastmd-table-toolbar-group">'
    for (const [action, label, title] of DEL_BTNS) {
      html += `<button class="fastmd-table-toolbar-btn destructive" data-action="${action}" title="${title}" aria-label="${title}">${label}</button>`
    }
    html += '</div>'

    // Separator
    html += '<div class="fastmd-table-toolbar-sep" role="separator"></div>'

    // Sort buttons
    html += '<div class="fastmd-table-toolbar-group">'
    for (const [action, label, title] of SORT_BTNS) {
      html += `<button class="fastmd-table-toolbar-btn" data-action="${action}" title="${title}" aria-label="${title}">${label}</button>`
    }
    html += '</div>'

    // Separator
    html += '<div class="fastmd-table-toolbar-sep" role="separator"></div>'

    // Alignment dropdowns (populated dynamically)
    html += '<div class="fastmd-table-toolbar-align">'
    html += '<span class="fastmd-table-toolbar-align-label">Align:</span>'
    html += '</div>'

    // Separator
    html += '<div class="fastmd-table-toolbar-sep" role="separator"></div>'

    // Copy button
    html += `<button class="fastmd-table-toolbar-btn copy" data-action="copy" title="Copy table to clipboard" aria-label="Copy table to clipboard">Copy</button>`

    // Cell indicator
    html += '<div class="fastmd-table-toolbar-cell" title="Current cell">-- --</div>'

    return html
  }

  private onMouseDown = (e: MouseEvent): void => {
    const btn = (e.target as Element).closest('[data-action]') as HTMLElement | null
    if (!btn) return
    e.preventDefault()

    const action = btn.dataset.action!

    switch (action) {
      case 'add-row':
      case 'add-col':
      case 'delete-row':
      case 'delete-col':
      case 'sort-asc':
      case 'sort-desc':
      case 'copy':
        this.actionCb?.({ type: action } as TableAction)
        break
    }
  }

  private onChange = (e: Event): void => {
    const select = e.target as HTMLSelectElement
    if (!select.dataset.col) return
    e.preventDefault()

    const col = parseInt(select.dataset.col, 10)
    const align = select.value as TableAlign
    this.actionCb?.({ type: 'set-align', col, align })
  }
}
