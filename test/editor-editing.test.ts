import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveEditorPlus } from '../src/editorPlus'
import { setFlatOffset } from '../src/cursor'

type ClipboardStore = {
  getData: (type: string) => string
  setData: (type: string, value: string) => void
}

const editors: LiveEditorPlus[] = []

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

function createEditor(onChange: (text: string) => void = () => {}, toolbar = false) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const editor = new LiveEditorPlus(container, { onChange, toolbar })
  editors.push(editor)

  const root = container.querySelector<HTMLElement>('.live-editor')
  if (!root) throw new Error('Editor root not rendered')
  return { container, editor, root }
}

function lineElement(root: HTMLElement, line: number) {
  const el = root.querySelector<HTMLElement>(`[data-line="${line}"]`)
  if (!el) throw new Error(`Line ${line} not rendered`)
  return el
}

function domPosition(root: HTMLElement, line: number, offset: number) {
  const pos = setFlatOffset(lineElement(root, line), offset)
  if (!pos) throw new Error(`Offset ${offset} not found on line ${line}`)
  return pos
}

function setCursor(root: HTMLElement, line: number, offset: number) {
  const pos = domPosition(root, line, offset)
  const range = document.createRange()
  range.setStart(pos.node, pos.offset)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  root.focus()
}

function selectRange(
  root: HTMLElement,
  startLine: number,
  startOffset: number,
  endLine: number,
  endOffset: number,
) {
  const start = domPosition(root, startLine, startOffset)
  const end = domPosition(root, endLine, endOffset)
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  root.focus()
}

function key(root: HTMLElement, keyName: string, init: KeyboardEventInit = {}) {
  root.dispatchEvent(new KeyboardEvent('keydown', {
    key: keyName,
    bubbles: true,
    cancelable: true,
    ...init,
  }))
}

function beforeInput(root: HTMLElement, inputType: string, data = '') {
  const event = new Event('beforeinput', {
    bubbles: true,
    cancelable: true,
  }) as InputEvent

  Object.defineProperty(event, 'inputType', { value: inputType })
  Object.defineProperty(event, 'data', { value: data })
  root.dispatchEvent(event)
  return event
}

function clipboardEvent(type: 'copy' | 'cut') {
  const values = new Map<string, string>()
  const clipboardData: ClipboardStore = {
    getData: (dataType) => values.get(dataType) ?? '',
    setData: (dataType, value) => {
      values.set(dataType, value)
    },
  }
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent

  Object.defineProperty(event, 'clipboardData', { value: clipboardData })
  return { event, clipboardData }
}

function rect(top: number, bottom: number) {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 400,
    toJSON: () => {},
    top,
    width: 400,
    x: 0,
    y: top,
  } as DOMRect
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  let frameTime = 0
  let frameId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frameTime += 100
    frameId += 1
    callback(frameTime)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('LiveEditor basic editing', () => {
  it('uses loaded content as the undo baseline and emits undo/redo changes', () => {
    const changes: string[] = []
    const { editor, root } = createEditor((text) => changes.push(text))

    editor.setValue('loaded')
    setCursor(root, 0, 6)
    editor.insert('!')

    expect(editor.getValue()).toBe('loaded!')
    key(root, 'z', { ctrlKey: true })
    expect(editor.getValue()).toBe('loaded')
    expect(changes.at(-1)).toBe('loaded')

    key(root, 'y', { ctrlKey: true })
    expect(editor.getValue()).toBe('loaded!')
    expect(changes.at(-1)).toBe('loaded!')
  })

  it('handles Enter as a new Markdown line', () => {
    const { editor, root } = createEditor()

    editor.setValue('alpha')
    setCursor(root, 0, 5)
    key(root, 'Enter')

    expect(editor.getValue()).toBe('alpha\n')
    expect(root.querySelectorAll('.live-line')).toHaveLength(2)
  })

  it('scrolls the active caret line into view after Enter', () => {
    const scrollHost = document.createElement('div')
    scrollHost.style.overflowY = 'auto'
    Object.defineProperty(scrollHost, 'clientHeight', { configurable: true, value: 120 })
    Object.defineProperty(scrollHost, 'scrollHeight', { configurable: true, value: 400 })
    document.body.appendChild(scrollHost)

    const editor = new LiveEditorPlus(scrollHost)
    editors.push(editor)
    const root = scrollHost.querySelector<HTMLElement>('.live-editor')
    if (!root) throw new Error('Editor root not rendered')

    const getRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    getRect.mockImplementation(function mockRect(this: HTMLElement) {
      if (this === scrollHost) return rect(0, 120)
      if (this.dataset.line === '1') return rect(150, 180)
      return rect(20, 50)
    })

    editor.setValue('a'.repeat(120))
    setCursor(root, 0, 120)
    key(root, 'Enter')

    expect(scrollHost.scrollTop).toBeGreaterThan(0)
  })

  it('animates caret autoscroll instead of jumping in one frame', () => {
    const frames: Array<{ id: number; callback: FrameRequestCallback; cancelled: boolean }> = []
    let frameId = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameId += 1
      frames.push({ id: frameId, callback, cancelled: false })
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      const frame = frames.find((entry) => entry.id === id)
      if (frame) frame.cancelled = true
    })
    const runNextFrame = (time: number) => {
      while (frames.length > 0) {
        const frame = frames.shift()
        if (!frame || frame.cancelled) continue
        frame.callback(time)
        return
      }
    }

    const scrollHost = document.createElement('div')
    scrollHost.style.overflowY = 'auto'
    Object.defineProperty(scrollHost, 'clientHeight', { configurable: true, value: 120 })
    Object.defineProperty(scrollHost, 'scrollHeight', { configurable: true, value: 400 })
    document.body.appendChild(scrollHost)

    const editor = new LiveEditorPlus(scrollHost)
    editors.push(editor)
    const root = scrollHost.querySelector<HTMLElement>('.live-editor')
    if (!root) throw new Error('Editor root not rendered')

    const getRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    getRect.mockImplementation(function mockRect(this: HTMLElement) {
      if (this === scrollHost) return rect(0, 120)
      if (this.dataset.line === '1') return rect(150, 180)
      return rect(20, 50)
    })

    editor.setValue('a'.repeat(120))
    setCursor(root, 0, 120)
    key(root, 'Enter')

    expect(scrollHost.scrollTop).toBe(0)
    runNextFrame(0)
    expect(scrollHost.scrollTop).toBe(0)
    runNextFrame(0)
    expect(scrollHost.scrollTop).toBe(0)
    runNextFrame(90)
    expect(scrollHost.scrollTop).toBeGreaterThan(0)
    expect(scrollHost.scrollTop).toBeLessThan(132)
    runNextFrame(180)
    expect(scrollHost.scrollTop).toBe(132)
  })

  it('pulls a top-edge caret line into the safe reading zone', () => {
    const scrollHost = document.createElement('div')
    scrollHost.style.overflowY = 'auto'
    scrollHost.scrollTop = 220
    Object.defineProperty(scrollHost, 'clientHeight', { configurable: true, value: 600 })
    Object.defineProperty(scrollHost, 'scrollHeight', { configurable: true, value: 1200 })
    document.body.appendChild(scrollHost)

    const editor = new LiveEditorPlus(scrollHost)
    editors.push(editor)
    const root = scrollHost.querySelector<HTMLElement>('.live-editor')
    if (!root) throw new Error('Editor root not rendered')

    const getRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    getRect.mockImplementation(function mockRect(this: HTMLElement) {
      if (this === scrollHost) return rect(0, 600)
      if (this.dataset.line === '5') return rect(52, 82)
      return rect(260, 290)
    })

    editor.setValue(Array.from({ length: 12 }, (_, index) => `line ${index}`).join('\n'))
    setCursor(root, 5, 2)
    document.dispatchEvent(new Event('selectionchange'))

    expect(scrollHost.scrollTop).toBeLessThan(220)
  })

  it('handles Shift+Enter as a Markdown hard break', () => {
    const { editor, root } = createEditor()

    editor.setValue('alpha')
    setCursor(root, 0, 5)
    key(root, 'Enter', { shiftKey: true })

    expect(editor.getValue()).toBe('alpha  \n')
    expect(root.querySelector('.live-hard-break')?.textContent).toBe('  ')
  })

  it('joins lines with Backspace and Delete at line boundaries', () => {
    const { editor, root } = createEditor()

    editor.setValue('ab\ncd')
    setCursor(root, 1, 0)
    key(root, 'Backspace')
    expect(editor.getValue()).toBe('abcd')

    editor.setValue('ab\ncd')
    setCursor(root, 0, 2)
    key(root, 'Delete')
    expect(editor.getValue()).toBe('abcd')
  })

  it('deletes selections across rendered lines', () => {
    const { editor, root } = createEditor()

    editor.setValue('ab\ncd')
    selectRange(root, 0, 1, 1, 1)
    key(root, 'Backspace')

    expect(editor.getValue()).toBe('ad')
  })

  it('supports word deletion shortcuts', () => {
    const { editor, root } = createEditor()

    editor.setValue('hello world')
    setCursor(root, 0, 11)
    key(root, 'Backspace', { ctrlKey: true })
    expect(editor.getValue()).toBe('hello ')

    editor.setValue('hello world')
    setCursor(root, 0, 0)
    key(root, 'Delete', { ctrlKey: true })
    expect(editor.getValue()).toBe(' world')
  })

  it('supports Ctrl+A as select all', () => {
    const { editor, root } = createEditor()

    editor.setValue('one\ntwo')
    setCursor(root, 1, 3)
    key(root, 'a', { ctrlKey: true })
    key(root, 'Backspace')

    expect(editor.getValue()).toBe('')
  })

  it('supports Home and End line navigation', () => {
    const { editor, root } = createEditor()

    editor.setValue('abc\ndef')
    setCursor(root, 1, 2)
    key(root, 'Home')
    editor.insert('X')
    expect(editor.getValue()).toBe('abc\nXdef')

    key(root, 'End')
    editor.insert('!')
    expect(editor.getValue()).toBe('abc\nXdef!')
  })

  it('supports Shift+Arrow text selection', () => {
    const { editor, root } = createEditor()

    editor.setValue('abc')
    setCursor(root, 0, 3)
    key(root, 'ArrowLeft', { shiftKey: true })
    key(root, 'Backspace')

    expect(editor.getValue()).toBe('ab')
  })

  it('copies and cuts selected Markdown as plain text', () => {
    const { editor, root } = createEditor()

    editor.setValue('**bold**\ntext')
    selectRange(root, 0, 0, 0, 8)

    const copy = clipboardEvent('copy')
    root.dispatchEvent(copy.event)
    expect(copy.clipboardData.getData('text/plain')).toBe('**bold**')
    expect(editor.getValue()).toBe('**bold**\ntext')

    const cut = clipboardEvent('cut')
    root.dispatchEvent(cut.event)
    expect(cut.clipboardData.getData('text/plain')).toBe('**bold**')
    expect(editor.getValue()).toBe('\ntext')
  })

  it('keeps composition input editable without rendering mid-composition', () => {
    const changes: string[] = []
    const { editor, root } = createEditor((text) => changes.push(text))

    editor.setValue('')
    root.dispatchEvent(new Event('compositionstart', { bubbles: true }))
    lineElement(root, 0).textContent = 'あ'
    root.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertCompositionText',
      data: 'あ',
    }))

    expect(editor.getValue()).toBe('あ')
    expect(changes.at(-1)).toBe('あ')

    root.dispatchEvent(new Event('compositionend', { bubbles: true }))
    expect(editor.getValue()).toBe('あ')
    expect(lineElement(root, 0).textContent).toBe('あ')
  })

  it('preserves raw citation markers when reading hybrid badge decorations', () => {
    const raw = '\uE200cite\uE202turn26view0\uE202turn27view0\uE201'
    const { editor, root } = createEditor()

    editor.setValue(`alpha ${raw}`)
    editor.setViewMode('hybrid')

    const line = lineElement(root, 0)
    expect(line.querySelector('.live-citation')?.textContent).toBe('citas 2')

    line.appendChild(document.createTextNode('!'))
    root.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: '!',
    }))

    expect(editor.getValue()).toBe(`alpha ${raw}!`)
  })

  it('handles beforeinput editing intents when the browser does not send keydown', () => {
    const { editor, root } = createEditor()

    editor.setValue('alpha')
    setCursor(root, 0, 5)
    const paragraph = beforeInput(root, 'insertParagraph')
    expect(paragraph.defaultPrevented).toBe(true)
    expect(editor.getValue()).toBe('alpha\n')

    const backward = beforeInput(root, 'deleteContentBackward')
    expect(backward.defaultPrevented).toBe(true)
    expect(editor.getValue()).toBe('alpha')
  })

  it('renders the formatting toolbar and applies toolbar actions', () => {
    const { editor, root, container } = createEditor(undefined, true)

    editor.setValue('bold')
    selectRange(root, 0, 0, 0, 4)

    const boldButton = container.querySelector<HTMLElement>('.veloxmd-toolbar-btn[data-action="bold"]')
    expect(boldButton).not.toBeNull()

    boldButton?.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    }))

    expect(editor.getValue()).toBe('**bold**')
  })
})
