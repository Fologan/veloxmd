import { afterEach, describe, expect, it } from 'vitest'
import { LiveEditorPlus } from '../src/editorPlus'

const pastedMarkdown = [
  '# Tierra 2.0',
  '',
  '## 1. Idea central',
  '',
  'Texto con **negritas** y *énfasis*.',
].join('\r\n')

function clipboardPasteEvent(text: string): ClipboardEvent {
  const event = new Event('paste', {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent

  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  })

  return event
}

function createEditor(onChange: (text: string) => void) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const editor = new LiveEditorPlus(container, { onChange })
  const root = container.querySelector<HTMLElement>('.live-editor')
  if (!root) throw new Error('Editor root not rendered')

  return { container, editor, root }
}

async function flushMutations() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('LiveEditor paste reconciliation', () => {
  it('emits changes and renders markdown when paste happens without a saved cursor', () => {
    const changes: string[] = []
    const { editor, root } = createEditor((text) => changes.push(text))

    root.dispatchEvent(clipboardPasteEvent(pastedMarkdown))

    const expected = pastedMarkdown.replace(/\r\n?/g, '\n')
    expect(editor.getValue()).toBe(expected)
    expect(changes.at(-1)).toBe(expected)
    expect(root.querySelector('.live-h1')?.textContent).toContain('Tierra 2.0')
    expect(root.querySelector('.live-h2')?.textContent).toContain('Idea central')
    expect(root.querySelector('strong')?.textContent).toBe('negritas')

    editor.destroy()
  })

  it('recovers native contenteditable paste mutations before the app switches views', async () => {
    const changes: string[] = []
    const { editor, root } = createEditor((text) => changes.push(text))

    const rawLines = pastedMarkdown.split('\n')
    root.replaceChildren(
      ...rawLines.map((line, index) => {
        const item = document.createElement('div')
        item.className = 'live-line'
        item.dataset.line = String(index)
        item.textContent = line
        return item
      }),
    )

    await flushMutations()

    const expected = pastedMarkdown.replace(/\r\n?/g, '\n')
    expect(editor.getValue()).toBe(expected)
    expect(changes.at(-1)).toBe(expected)
    expect(root.querySelector('.live-h1')?.textContent).toContain('Tierra 2.0')
    expect(root.querySelector('.live-h2')?.textContent).toContain('Idea central')
    expect(root.querySelector('strong')?.textContent).toBe('negritas')

    editor.destroy()
  })
})
