import { LiveEditorPlus } from './editorPlus.js'

const root = document.getElementById('editor-root')!
const editor = new LiveEditorPlus(root)

// Load sample button — loads full markdown reference to test all features
const loadBtn = document.getElementById('load-sample')
loadBtn?.addEventListener('click', async () => {
  try {
    const res = await fetch('/spec/markdown-reference.md')
    const text = await res.text()
    editor.setValue(text)
  } catch {
    // Fallback sample if fetch fails
    editor.setValue(`# UltraMD Live

## Features Demo

This is **bold**, *italic*, ***bold italic***, ~~strikethrough~~, and \`inline code\`.

### Task Lists

- [x] Task lists working
- [ ] More features coming

### Tables

| Feature | Status |
| ------- | ------ |
| **Tables** | Done |
| *Italic* | Done |

### Nested Quotes

> First level
> > Second level
> > > Third level

### Code

\`\`\`javascript
const editor = new LiveEditorPlus(container)
editor.setValue("# Hello **world**")
\`\`\`

### Links & References

[Inline link](https://github.com) and <https://autolink.com>

Footnote reference[^1] in text.

[^1]: This is the footnote definition.

---

*The text knows what's around it.*`)
  }
  loadBtn!.style.display = 'none'
})

const viewToggle = document.getElementById('view-mode-toggle')
viewToggle?.addEventListener('click', () => {
  const next = editor.getViewMode() === 'live' ? 'hybrid' : 'live'
  editor.setViewMode(next)
  viewToggle.textContent = next === 'hybrid' ? 'Live mode' : 'Hybrid mode'
})
