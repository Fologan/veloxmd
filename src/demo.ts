import { LiveEditorPlus } from './editorPlus.js'
import { LiveViewer } from './viewer.js'

const DEFAULT_DOC = `# Release Notes — v2.4.0

The team shipped **three major features** this sprint. Here's what changed and why it matters.

## What's New

### Collaborative Editing

Real-time collaboration is now live. Multiple users can edit the same document simultaneously with *cursor presence* and \`conflict resolution\` built in.

Key changes:

- [x] WebSocket transport layer
- [x] Operational Transform engine
- [x] Cursor presence indicators
- [ ] Offline sync (planned for v2.5)

> This has been our most requested feature since launch. Early testers report a **40% reduction** in back-and-forth review cycles.

### Export Pipeline

Documents can now be exported to multiple formats:

| Format | Status | Notes |
| ------ | :----: | ----- |
| PDF | Done | Via headless Chrome |
| DOCX | Done | Basic styling only |
| HTML | Done | Includes CSS bundle |
| LaTeX | Beta | Math blocks supported |

To export programmatically:

\`\`\`javascript
const doc = editor.getValue()
const pdf = await exportTo(doc, 'pdf', {
  pageSize: 'A4',
  margin: '2cm',
})
\`\`\`

### Math Support

Inline math like $E = mc^2$ now renders correctly. Block equations use double dollar signs:

$$
\\sum_{i=1}^{n} x_i = x_1 + x_2 + \\cdots + x_n
$$

## Breaking Changes

The \`render()\` method signature changed. If you were using the old API:

\`\`\`javascript
// Before (v2.3)
editor.render({ target: '#app' })

// After (v2.4)
editor.mount(document.getElementById('app'))
\`\`\`

## Known Issues

1. Large documents (>5,000 lines) may experience input lag on mobile
2. Table alignment is not preserved during DOCX export
3. Nested blockquotes beyond level 3 lose styling

> > **Internal note:** Issue #1 is tracked in the performance epic. The fix requires the block-level render optimization discussed in the architecture review.

## Contributors

Thanks to everyone who made this release possible. Special mention to the docs team for updating all **47 integration guides** before launch[^1].

[^1]: Full changelog available at the [release page](https://github.com).

---

*Next milestone: v2.5 — offline sync and mobile performance.*
`

const root = document.getElementById('editor-root')!
const editor = new LiveEditorPlus(root, {
  onChange: (text) => {
    const counter = document.getElementById('char-count')
    if (counter) counter.textContent = `${text.length} chars`
  },
})

// Load default document
editor.setValue(DEFAULT_DOC)

// Load sample button — loads full markdown reference to test all features
const loadBtn = document.getElementById('load-sample')
loadBtn?.addEventListener('click', async () => {
  try {
    const res = await fetch('/spec/markdown-reference.md')
    const text = await res.text()
    editor.setValue(text)
  } catch {
    editor.setValue(DEFAULT_DOC)
  }
  loadBtn!.style.display = 'none'
})

const viewToggle = document.getElementById('view-mode-toggle')
viewToggle?.addEventListener('click', () => {
  const next = editor.getViewMode() === 'source' ? 'hybrid' : 'source'
  editor.setViewMode(next)
  viewToggle.textContent = next === 'hybrid' ? 'Source mode' : 'Hybrid mode'
})

// Test insert() — button inserts bold marker at cursor
const insertBtn = document.getElementById('insert-bold')
insertBtn?.addEventListener('click', () => {
  editor.insert('**bold text**')
})

// Static viewer demo
const viewerRoot = document.getElementById('viewer-root')
if (viewerRoot) {
  const viewer = new LiveViewer(viewerRoot)
  viewer.setValue(DEFAULT_DOC)
}
