import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveEditorPlus } from '../src/editorPlus.js'
import { LiveViewer } from '../src/viewer.js'

const editors: Array<{ destroy(): void }> = []

afterEach(() => {
  editors.splice(0).forEach(editor => editor.destroy())
  document.body.innerHTML = ''
})

function boardMarkdown() {
  return [
    '# Project',
    '```board',
    '## To do',
    '- [ ] First card',
    '',
    '## Done',
    '- [x] Existing card',
    '```',
  ].join('\n')
}

describe('visual block integration', () => {
  it('renders Board inline in hybrid without changing direct line parity', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const editor = new LiveEditorPlus(container)
    editors.push(editor)
    editor.setValue(boardMarkdown())
    editor.setViewMode('hybrid')

    const root = container.querySelector<HTMLElement>('.live-editor')!
    expect(container.querySelector('.veloxmd-board')).not.toBeNull()
    expect(root.children).toHaveLength(boardMarkdown().split('\n').length)
    expect(root.querySelector('[data-line="1"]')?.classList.contains('veloxmd-visual-host')).toBe(true)
  })

  it('commits a Board interaction through editor onChange and undo', () => {
    const changes: string[] = []
    const container = document.createElement('div')
    document.body.appendChild(container)
    const editor = new LiveEditorPlus(container, { onChange: text => changes.push(text) })
    editors.push(editor)
    editor.setValue(boardMarkdown())
    editor.setViewMode('hybrid')

    container.querySelector<HTMLButtonElement>('.veloxmd-board-check')?.click()
    expect(editor.getValue()).toContain('- [x] First card')
    expect(changes.at(-1)).toBe(editor.getValue())

    editor.undo()
    expect(editor.getValue()).toContain('- [ ] First card')
  })

  it('allows static visual interactions to update the Markdown model', () => {
    const onChange = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const viewer = new LiveViewer(container, { onChange })
    editors.push(viewer)
    viewer.setValue(boardMarkdown())

    container.querySelector<HTMLButtonElement>('.veloxmd-board-check')?.click()
    expect(viewer.getValue()).toContain('- [x] First card')
    expect(onChange).toHaveBeenCalledWith(viewer.getValue())
  })

  it('keeps raw source visible in source mode', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const editor = new LiveEditorPlus(container)
    editors.push(editor)
    editor.setValue(boardMarkdown())

    expect(container.querySelector('.veloxmd-board')).toBeNull()
    expect(editor.getValue()).toBe(boardMarkdown())
  })
})
