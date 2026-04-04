# VeloxMD

In-place markdown editor for the web. Zero dependencies. ~2KB gzipped.

The text formats itself as you type — no split view, no separate preview pane. Markdown syntax markers stay in the DOM but fade to near-invisible, so what you see is what you get.

**[Live Demo](https://fastmd.vercel.app)**

> **Alpha** — API may change between minor versions.

## Install

```bash
npm install veloxmd
```

## Quick Start

### Basic Editor

```ts
import { LiveEditor } from 'veloxmd'
import 'veloxmd/styles.css'

const editor = new LiveEditor(document.getElementById('editor'))
editor.setValue('# Hello **world**')
```

### Full-Featured Editor with Toolbar

```ts
import { LiveEditorPlus } from 'veloxmd'
import 'veloxmd/styles.css'

const editor = new LiveEditorPlus(document.getElementById('editor'), {
  toolbar: true,
  onChange: (text) => console.log('Content changed:', text.length, 'chars'),
  placeholder: 'Start writing...',
})

editor.setValue('# Hello **world**')
```

### Static Viewer (read-only)

```ts
import { LiveViewer } from 'veloxmd'
import 'veloxmd/styles.css'

const viewer = new LiveViewer(document.getElementById('preview'))
viewer.setValue('# Hello **world**')
```

Same CSS, same styling — but no `contenteditable`, no event listeners, no undo stack. One-pass render, zero runtime overhead.

## View Modes

VeloxMD has three ways to display markdown:

| Mode | Class | What you see |
|------|-------|-------------|
| **Source** | `LiveEditorPlus` | Full editor with live formatting. Headings scale up, bold/italic render in place, and syntax markers (`#`, `**`, etc.) stay visible alongside the formatted text. The focused line brightens markers for clarity. |
| **Hybrid** | `LiveEditorPlus` + `setViewMode('hybrid')` | Same live formatting, but syntax markers collapse to zero-width on unfocused lines and expand with animation on focus — a clean reading experience that reveals markdown on demand. |
| **Static** | `LiveViewer` | Read-only rendered output. No syntax markers, no editing, no runtime overhead. |

Source mode is what makes VeloxMD unique — it's not a plain-text editor with a preview pane. The text formats itself as you type while keeping every markdown character editable in place.

```ts
// Switch between source and hybrid at runtime
editor.setViewMode('hybrid')
editor.setViewMode('source')
```

## How It Works

VeloxMD uses **character parity** — a design principle where every raw markdown character stays in the DOM. Syntax markers like `#`, `**`, `*`, `` ` `` are not removed; they're wrapped in `<span class="syntax">` and dimmed with CSS opacity.

This means the flat character offset in your raw text always matches the flat offset in the DOM. Cursor save/restore after re-rendering becomes trivial — no complex position mapping needed. The entire cursor system is ~50 lines of code.

The editor uses `contenteditable` with full re-rendering on each keystroke. Because every character has a 1:1 DOM representation, this "naive" approach just works, and the codebase stays small.

### Hybrid Mode

In hybrid mode, syntax spans on unfocused lines collapse to `width: 0` via CSS transitions. The `HybridController` measures text widths using an offscreen canvas (`measureText`) so the CSS can animate between collapsed and expanded states. Click correction compensates for the layout shift — when you click a collapsed line, the controller maps the visual click position to the correct character offset in the expanded layout.

## Markdown Support

| Feature | `LiveEditor` | `LiveEditorPlus` |
|---|:---:|:---:|
| Headings (`#` to `######`) | ✓ | ✓ |
| Bold, Italic, Bold-Italic | ✓ | ✓ |
| Strikethrough (`~~`) | ✓ | ✓ |
| Inline code | ✓ | ✓ |
| Links `[text](url)` | ✓ | ✓ |
| Images `![alt](url)` | ✓ | ✓ |
| Blockquotes (nested) | ✓ | ✓ |
| Ordered & unordered lists | ✓ | ✓ |
| Code blocks (fenced) | ✓ | ✓ |
| Horizontal rules | ✓ | ✓ |
| Escape sequences | ✓ | ✓ |
| Tables | | ✓ |
| Task lists | | ✓ |
| Footnotes | | ✓ |
| Autolinks (`<url>`) | | ✓ |
| Reference links | | ✓ |
| HTML inline (`<kbd>`, `<mark>`, `<u>`) | | ✓ |
| Superscript / Subscript | | ✓ |
| Math (`$...$`) | | ✓ |
| Highlight (`==..==`) | | ✓ |
| `<details>` / `<summary>` | | ✓ |
| Hard breaks | | ✓ |
| HTML comments | | ✓ |
| Alt heading syntax (`===`, `---`) | | ✓ |
| Image preview | | ✓ |
| Hybrid view mode | | ✓ |

## Toolbar

Enable a native formatting toolbar by passing `toolbar: true` in options. No external dependencies — all buttons are text/unicode with a single SVG for the link icon.

```ts
const editor = new LiveEditorPlus(container, { toolbar: true })
```

The toolbar includes: Undo/Redo, Headings (dropdown H1-H6), Bold, Italic, Underline, Strikethrough, Highlight, Inline Code, Link, Image, Table, Horizontal Rule, Bullet List, Ordered List, Task List, Blockquote, Code Block, Details/Summary, Superscript, Subscript, Math, and Footnote.

### Smart Insertion

Toolbar buttons and keyboard shortcuts detect whether text is selected:

- **Text selected** — wraps the selection (e.g. select "hello" + click Bold → `**hello**`)
- **No selection** — inserts a placeholder with the text pre-selected for immediate typing

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+B | Bold |
| Ctrl+I | Italic |
| Ctrl+U | Underline |
| Ctrl+E | Inline code |
| Ctrl+K | Link |
| Ctrl+Shift+X | Strikethrough |
| Ctrl+Shift+K | Code block |
| Ctrl+Shift+Q | Blockquote |
| Ctrl+Shift+O | Ordered list |
| Ctrl+Shift+U | Unordered list |
| Ctrl+Shift+H | Horizontal rule |

### Toolbar Theming

The toolbar uses its own set of CSS custom properties for easy customization:

```css
.my-editor-container {
  --fastmd-toolbar-bg: #ffffff;
  --fastmd-toolbar-border: #e1e4e8;
  --fastmd-toolbar-text: #24292e;
  --fastmd-toolbar-button-hover: #f0f1f3;
  --fastmd-toolbar-button-active: #e1e4e8;
  --fastmd-toolbar-separator: #d1d5da;
  --fastmd-toolbar-radius: 6px;
  --fastmd-toolbar-dropdown-bg: #ffffff;
  --fastmd-toolbar-dropdown-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
```

The toolbar is responsive — buttons that overflow are automatically moved to a `⋯` overflow menu.

## Theming

VeloxMD uses CSS custom properties prefixed with `--fastmd-`. Override them to match your app's design:

```css
.my-editor-container {
  --fastmd-bg: #1a1a2e;
  --fastmd-text: #eaeaea;
  --fastmd-text-bright: #ffffff;
  --fastmd-text-muted: #888;
  --fastmd-syntax: #555;
  --fastmd-accent: #e94560;
  --fastmd-green: #0f3460;
  --fastmd-purple: #a855f7;
  --fastmd-red: #ef4444;
  --fastmd-orange: #f97316;
  --fastmd-surface: #16213e;
  --fastmd-surface-2: #1a1a2e;
  --fastmd-border: #333;
  --fastmd-border-bright: #444;
}
```

A built-in dark theme is available by setting `data-theme="dark"` on any ancestor element.

## API

### `LiveEditor` / `LiveEditorPlus`

```ts
new LiveEditor(container: HTMLElement, options?: EditorOptions)
new LiveEditorPlus(container: HTMLElement, options?: EditorOptions)

interface EditorOptions {
  onChange?: (text: string) => void  // fires on every content change
  placeholder?: string              // placeholder text when editor is empty
  toolbar?: boolean                 // show formatting toolbar (default: false)
}

editor.setValue(markdown: string): void
editor.getValue(): string
editor.setViewMode(mode: 'source' | 'hybrid'): void
editor.getViewMode(): 'source' | 'hybrid'
editor.onChange(callback: (text: string) => void): void
editor.insert(text: string): void                              // insert at cursor
editor.toggleInline(before: string, after: string, placeholder: string): void  // wrap selection or insert
editor.toggleBlock(prefix: string): void                       // toggle line prefix
editor.insertTemplate(template: string): void                  // insert multi-line template
editor.undo(): void
editor.redo(): void
editor.destroy(): void
```

### `LiveViewer`

```ts
new LiveViewer(container: HTMLElement)

viewer.setValue(markdown: string): void
viewer.destroy(): void
```

### Parsers

```ts
import { parseLiveDocument, parseLiveDocumentPlus } from 'veloxmd'

const lines = parseLiveDocument(['# Hello', '', '**Bold** text'])
// Returns LiveLine[] with block types and inline segments
```

### Cursor Utilities

```ts
import { getFlatOffset, setFlatOffset } from 'veloxmd'

// Convert DOM position -> flat character offset
const offset = getFlatOffset(container, node, nodeOffset)

// Convert flat offset -> DOM position
const pos = setFlatOffset(container, 42)
```

## License

[MIT](LICENSE) - Fologan
