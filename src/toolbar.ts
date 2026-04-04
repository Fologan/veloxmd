// =============================================================================
// Toolbar — VeloxMD editor toolbar (config-driven, zero per-button listeners)
// =============================================================================

// [action, innerHTML, title, group] — group number drives separator placement
type BtnCfg = [string, string, string, number]

const BUTTONS: BtnCfg[] = [
  ['undo',         '↩',          'Undo (Ctrl+Z)',   1],
  ['redo',         '↪',          'Redo (Ctrl+Y)',   1],
  ['heading',      'H▾',         'Heading',         2], // dropdown trigger
  ['bold',         '<b>B</b>',   'Bold (Ctrl+B)',   3],
  ['italic',       '<i>I</i>',   'Italic (Ctrl+I)', 3],
  ['underline',    '<u>U</u>',   'Underline (Ctrl+U)', 3],
  ['strikethrough','<s>S</s>',   'Strikethrough (Ctrl+Shift+X)', 3],
  ['highlight',    '🖍',          'Highlight',       3],
  ['code-inline',  '&lt;/&gt;', 'Inline Code (Ctrl+E)',     3],
  ['link',         '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 13a5 5 0 0 0 8 1l4-4a1 1 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-8-1l-4 4a1 1 0 0 0 7 7l2-2"></path></svg>', 'Link (Ctrl+K)', 4],
  ['image',        '🖼',          'Image',           4],
  ['table',        '⊞',          'Table',           4],
  ['hr',           '—',          'Horizontal Rule (Ctrl+Shift+H)', 4],
  ['ul',           '•',          'Bullet List (Ctrl+Shift+U)',     5],
  ['ol',           '1.',         'Numbered List (Ctrl+Shift+O)',   5],
  ['task',         '☐',          'Task List',       5],
  ['blockquote',   '❝',          'Blockquote (Ctrl+Shift+Q)',      6],
  ['code-block',   '{}',         'Code Block (Ctrl+Shift+K)',      6],
  ['details',      '▶',          'Details',         6],
  ['superscript',  'X²',         'Superscript',     7],
  ['subscript',    'X₂',         'Subscript',       7],
  ['math',         '∑',          'Math',            7],
  ['footnote',     '¹',          'Footnote',        7],
]

const GROUP_LABELS: Record<number, string> = {
  1: 'History', 2: 'Headings', 3: 'Inline formatting',
  4: 'Insert', 5: 'Lists', 6: 'Blocks', 7: 'Advanced',
}

const HEADINGS = ['Normal text', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6']

const ACTIONS: Record<string, (e: any) => void> = {
  undo:          e => e.undo(),
  redo:          e => e.redo(),
  bold:          e => e.toggleInline('**', '**', 'bold'),
  italic:        e => e.toggleInline('*', '*', 'italic'),
  underline:     e => e.toggleInline('<u>', '</u>', 'underline'),
  strikethrough: e => e.toggleInline('~~', '~~', 'strikethrough'),
  highlight:     e => e.toggleInline('<mark>', '</mark>', 'highlight'),
  'code-inline': e => e.toggleInline('`', '`', 'code'),
  link:          e => e.wrapOrInsert('[${sel}](url)', 'link text'),
  image:         e => e.wrapOrInsert('![${sel}](url)', 'alt text'),
  table:         e => e.insertTemplate('| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |'),
  hr:            e => e.insertTemplate('\n---\n'),
  ul:            e => e.toggleBlock('- '),
  ol:            e => e.toggleBlock('1. '),
  task:          e => e.toggleBlock('- [ ] '),
  blockquote:    e => e.toggleBlock('> '),
  'code-block':  e => e.wrapOrInsert('```\n${sel}\n```', 'code'),
  details:       e => e.wrapOrInsert('<details>\n<summary>Summary</summary>\n${sel}\n</details>', 'Content'),
  superscript:   e => e.toggleInline('^', '^', 'text'),
  subscript:     e => e.toggleInline('~', '~', 'text'),
  math:          e => e.toggleInline('$', '$', 'expression'),
  footnote:      e => e.wrapOrInsert('[^1]\n\n[^1]: ${sel}', 'footnote text'),
  ...Object.fromEntries(
    HEADINGS.map((_, i) => [`heading-${i}`, (e: any) => e.toggleBlock(i === 0 ? '' : '#'.repeat(i) + ' ')])
  ),
}

export class Toolbar {
  private bar: HTMLElement
  private overflow: HTMLElement
  private overflowMenu: HTMLElement
  private ro: ResizeObserver
  private offOutside: (e: MouseEvent) => void

  constructor(private editor: any, wrapper: HTMLElement) {
    // Build toolbar HTML in one shot
    let groupHtml = ''
    let curGroup = 0
    for (const [action, label, title, group] of BUTTONS) {
      if (group !== curGroup) {
        if (curGroup) groupHtml += '</div><div class="veloxmd-toolbar-separator" role="separator"></div>'
        groupHtml += `<div class="veloxmd-toolbar-group" role="group" aria-label="${GROUP_LABELS[group] || ''}">`
        curGroup = group
      }
      if (action === 'heading') {
        const items = HEADINGS.map((h, i) => `<button role="menuitem" data-action="heading-${i}">${h}</button>`).join('')
        groupHtml += `<div class="veloxmd-toolbar-dropdown">
          <button class="veloxmd-toolbar-btn" data-action="heading" title="${title}" aria-haspopup="true" aria-expanded="false" aria-label="Heading">${label}</button>
          <div class="veloxmd-toolbar-dropdown-menu" role="menu">${items}</div>
        </div>`
      } else {
        groupHtml += `<button class="veloxmd-toolbar-btn" data-action="${action}" title="${title}" aria-label="${title}">${label}</button>`
      }
    }
    groupHtml += '</div>'

    // Overflow button + menu (hidden until needed)
    const overflowHtml = `<div class="veloxmd-toolbar-group veloxmd-toolbar-overflow" style="display:none">
      <div class="veloxmd-toolbar-dropdown">
        <button class="veloxmd-toolbar-btn" data-action="overflow" title="More" aria-label="More formatting options" aria-haspopup="true" aria-expanded="false">⋯</button>
        <div class="veloxmd-toolbar-dropdown-menu veloxmd-toolbar-overflow-menu" role="menu"></div>
      </div>
    </div>`

    const bar = document.createElement('div')
    bar.className = 'veloxmd-toolbar'
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-label', 'Formatting toolbar')
    bar.innerHTML = groupHtml + overflowHtml
    wrapper.insertBefore(bar, editor.root)

    this.bar = bar
    this.overflow = bar.querySelector('.veloxmd-toolbar-overflow')!
    this.overflowMenu = bar.querySelector('.veloxmd-toolbar-overflow-menu')!

    // Single delegated mousedown handler — preventDefault keeps editor focus
    bar.addEventListener('mousedown', this.onMouseDown)

    // Close dropdowns on outside click
    this.offOutside = (e: MouseEvent) => {
      if (!bar.contains(e.target as Node)) this.closeAll()
    }
    document.addEventListener('mousedown', this.offOutside, true)

    // Responsive overflow
    this.ro = new ResizeObserver(() => this.updateOverflow())
    this.ro.observe(bar)
    requestAnimationFrame(() => this.updateOverflow())
  }

  destroy(): void {
    this.ro.disconnect()
    document.removeEventListener('mousedown', this.offOutside, true)
    this.bar.remove()
  }

  // ---------------------------------------------------------------------------

  private onMouseDown = (e: MouseEvent) => {
    const btn = (e.target as Element).closest('[data-action]') as HTMLElement | null
    if (!btn) return
    e.preventDefault()

    const action = btn.dataset.action!

    // Heading trigger: toggle dropdown
    if (action === 'heading') {
      const dd = btn.closest('.veloxmd-toolbar-dropdown')!
      const isOpen = dd.classList.contains('open')
      this.closeAll()
      if (!isOpen) {
        dd.classList.add('open')
        btn.setAttribute('aria-expanded', 'true')
      }
      return
    }

    // Overflow trigger: toggle overflow menu
    if (action === 'overflow') {
      const dd = btn.closest('.veloxmd-toolbar-dropdown')!
      const isOpen = dd.classList.contains('open')
      this.closeAll()
      if (!isOpen) {
        dd.classList.add('open')
        btn.setAttribute('aria-expanded', 'true')
      }
      return
    }

    this.closeAll()

    const fn = ACTIONS[action]
    if (fn) fn(this.editor)
    this.editor.root.focus()
  }

  private closeAll() {
    this.bar.querySelectorAll('.veloxmd-toolbar-dropdown.open').forEach(d => {
      d.classList.remove('open')
      const trigger = d.querySelector('[aria-expanded]')
      trigger?.setAttribute('aria-expanded', 'false')
    })
  }

  // Move overflowing buttons into the "⋯" menu
  private updateOverflow() {
    const bar = this.bar
    // Restore all hidden buttons first
    bar.querySelectorAll<HTMLElement>('.veloxmd-toolbar-btn[data-hidden]').forEach(b => {
      b.removeAttribute('data-hidden')
      b.style.display = ''
      const grp = b.closest('.veloxmd-toolbar-group') as HTMLElement
      if (grp && !grp.classList.contains('veloxmd-toolbar-overflow')) grp.style.display = ''
      const sep = grp?.previousElementSibling as HTMLElement
      if (sep?.classList.contains('veloxmd-toolbar-separator')) sep.style.display = ''
    })
    this.overflowMenu.innerHTML = ''
    this.overflow.style.display = 'none'

    const barRight = bar.getBoundingClientRect().right
    // Reserve space for overflow button (approx 36px)
    const threshold = barRight - 40

    // Collect dropdown containers and direct buttons per group
    const allItems = Array.from(
      bar.querySelectorAll<HTMLElement>(
        '.veloxmd-toolbar-group:not(.veloxmd-toolbar-overflow) > .veloxmd-toolbar-btn, ' +
        '.veloxmd-toolbar-group:not(.veloxmd-toolbar-overflow) > .veloxmd-toolbar-dropdown'
      )
    )

    const overflowItems: HTMLElement[] = []
    for (const item of allItems) {
      const rect = item.getBoundingClientRect()
      if (rect.right > threshold) {
        overflowItems.push(item)
        // Hide original; clone into overflow menu
        const trigger = item.querySelector<HTMLElement>('.veloxmd-toolbar-btn') ?? (item as HTMLElement)
        trigger.setAttribute('data-hidden', '1')
        trigger.style.display = 'none'
        const clone = trigger.cloneNode(true) as HTMLElement
        clone.removeAttribute('data-hidden')
        clone.style.display = ''
        clone.setAttribute('role', 'menuitem')
        this.overflowMenu.appendChild(clone)
      }
    }

    if (overflowItems.length) {
      this.overflow.style.display = ''
    }

    // Hide separator if entire group is hidden
    bar.querySelectorAll<HTMLElement>('.veloxmd-toolbar-group:not(.veloxmd-toolbar-overflow)').forEach(grp => {
      const visible = grp.querySelectorAll<HTMLElement>('.veloxmd-toolbar-btn:not([data-hidden])')
      if (visible.length === 0) {
        grp.style.display = 'none'
        const sep = grp.previousElementSibling as HTMLElement
        if (sep?.classList.contains('veloxmd-toolbar-separator')) sep.style.display = 'none'
      }
    })
  }
}
