import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveEditorPlus } from '../src/editorPlus'
import { setFlatOffset } from '../src/cursor'

class CanvasMock {
  getContext() {
    return {
      font: '',
      measureText(text: string) {
        let width = 0
        for (const character of String(text)) width += character.codePointAt(0)! >= 0x2E80 ? 20 : 10
        return { width }
      },
    }
  }
}

function clipboardEvent() {
  const values = new Map<string, string>()
  const event = new Event('copy', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => values.get(type) ?? '',
      setData: (type: string, value: string) => values.set(type, value),
    },
  })
  return { event, values }
}

function line(root: HTMLElement, index: number): HTMLElement {
  return root.querySelector<HTMLElement>(`[data-line="${index}"]`)!
}

function select(root: HTMLElement, startLine: number, startOffset: number, endLine: number, endOffset: number) {
  const start = setFlatOffset(line(root, startLine), startOffset)!
  const end = setFlatOffset(line(root, endLine), endOffset)!
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  root.focus()
  document.dispatchEvent(new Event('selectionchange'))
}

describe('table clipboard integration', () => {
  let editor: LiveEditorPlus
  let container: HTMLElement
  let root: HTMLElement
  let writes: string[]

  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', CanvasMock)
    writes = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => { writes.push(value) } },
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    editor = new LiveEditorPlus(container)
    root = container.querySelector<HTMLElement>('.live-editor')!
  })

  afterEach(() => {
    editor.destroy()
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('replaces Ctrl+C only for a complete table selection', () => {
    const source = '| City\t| Country |\n| :--- | ---: |\n| 東京\t| 日本 |'
    editor.setValue(source)
    select(root, 0, 0, 2, source.split('\n')[2].length)
    const complete = clipboardEvent()
    root.dispatchEvent(complete.event)
    const copied = complete.values.get('text/plain')!
    expect(copied).not.toContain('\t')
    expect(copied).toContain('東京')

    select(root, 0, 0, 0, source.split('\n')[0].length)
    const partial = clipboardEvent()
    root.dispatchEvent(partial.event)
    expect(partial.values.get('text/plain')).toBe(source.split('\n')[0])
  })

  it('routes Copy and Copy Code through the portable renderer', async () => {
    const source = '| City | Country |\n| :--- | ---: |\n| 東京 | 日本 |'
    editor.setValue(source)
    select(root, 0, 2, 0, 2)

    const copy = container.querySelector<HTMLElement>('[data-action="copy"]')!
    copy.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    expect(writes[0]).toContain('東京')
    expect(writes[0]).not.toContain('\t')

    const copyCode = container.querySelector<HTMLElement>('[data-action="copy-code"]')!
    copyCode.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    expect(writes[1]).toMatch(/^```text\n/)
    expect(writes[1]).toMatch(/\n```$/)
    expect(writes[1]).not.toContain('\t')
    expect(editor.refreshTableFontMetrics()).toBe(true)
  })
})
