# FastMD

In-place markdown editor for the web. Zero dependencies. ~2KB gzipped.

The text formats itself as you type — no split view, no separate preview pane. Markdown syntax markers stay in the DOM but fade to near-invisible, so what you see is what you get.

**[Live Demo](https://fastmd.vercel.app)**

> **Alpha** — API may change between minor versions.

## Install

```bash
npm install fastmd
```

## Quick Start

### Basic Editor

```ts
import { LiveEditor } from 'fastmd'
import 'fastmd/styles.css'

const editor = new LiveEditor(document.getElementById('editor'))
editor.setValue('# Hello **world**')
```

### Full-Featured Editor

```ts
import { LiveEditorPlus } from 'fastmd'
import 'fastmd/styles.css'

const editor = new LiveEditorPlus(document.getElementById('editor'))
editor.setValue('# Hello **world**')

// Get the raw markdown
const md = editor.getValue()

// Toggle hybrid mode (syntax hides on unfocused lines)
editor.setViewMode('hybrid')
```

## How It Works

FastMD uses **character parity** — a design principle where every raw markdown character stays in the DOM. Syntax markers like `#`, `**`, `*`, `` ` `` are not removed; they're wrapped in `<span class="syntax">` and dimmed with CSS opacity.

This means the flat character offset in your raw text always matches the flat offset in the DOM. Cursor save/restore after re-rendering becomes trivial — no complex position mapping needed. The entire cursor system is ~50 lines of code.

The editor uses `contenteditable` with full re-rendering on each keystroke. Because every character has a 1:1 DOM representation, this "naive" approach just works, and the codebase stays small.

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

## Theming

FastMD uses CSS custom properties prefixed with `--fastmd-`. Override them to match your app's design:

```css
/* Custom theme */
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
new LiveEditor(container: HTMLElement)
new LiveEditorPlus(container: HTMLElement)

editor.setValue(markdown: string): void
editor.getValue(): string
editor.setViewMode(mode: 'live' | 'hybrid'): void
editor.getViewMode(): 'live' | 'hybrid'
```

### Parsers

```ts
import { parseLiveDocument, parseLiveDocumentPlus } from 'fastmd'

const lines = parseLiveDocument(['# Hello', '', '**Bold** text'])
// Returns LiveLine[] with block types and inline segments
```

### Cursor Utilities

```ts
import { getFlatOffset, setFlatOffset } from 'fastmd'

// Convert DOM position -> flat character offset
const offset = getFlatOffset(container, node, nodeOffset)

// Convert flat offset -> DOM position
const pos = setFlatOffset(container, 42)
```

## License

[MIT](LICENSE) - Charles Montero
