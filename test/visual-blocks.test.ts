import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveEditorPlus } from '../src/editorPlus.js'
import { LiveViewer } from '../src/viewer.js'

const editors: Array<{ destroy(): void }> = []

afterEach(() => {
  vi.restoreAllMocks()
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

function chartMarkdown() {
  return [
    '# Metrics',
    '```chart',
    '{',
    '  "version": 1,',
    '  "type": "line",',
    '  "title": "Readable data",',
    '  "labels": ["Jan", "Feb", "Mar"],',
    '  "series": [{ "name": "Sales", "values": [12, 19, 14], "color": "#5b8def" }],',
    '  "height": 280',
    '}',
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
    expect(root.childNodes).toHaveLength(boardMarkdown().split('\n').length)
    expect(Array.from(root.childNodes).filter(node => node.nodeType === Node.COMMENT_NODE)).toHaveLength(6)
    expect(root.querySelector('[data-line="1"]')?.classList.contains('veloxmd-visual-host')).toBe(true)
    expect(root.querySelector('[data-line="2"]')).toBeNull()
  })

  it('preserves detached visual source lines when another line is edited', () => {
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      font: '',
      measureText: (text: string) => ({ width: text.length * 8 }),
    } as unknown as CanvasRenderingContext2D)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const editor = new LiveEditorPlus(container)
    editors.push(editor)
    editor.setValue(boardMarkdown())
    editor.setViewMode('hybrid')

    const heading = container.querySelector<HTMLElement>('[data-line="0"]')!
    heading.textContent = '# Updated project'
    heading.dispatchEvent(new Event('input', { bubbles: true }))

    expect(editor.getValue()).toContain('# Updated project')
    expect(editor.getValue()).toContain('```board\n## To do\n- [ ] First card')
    expect(container.querySelector('.veloxmd-board')).not.toBeNull()
    canvas.mockRestore()
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

  it('renders a full-resolution static SVG and edits its real Markdown source', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const editor = new LiveEditorPlus(container)
    editors.push(editor)
    editor.setValue(chartMarkdown())
    editor.setViewMode('hybrid')

    const svg = container.querySelector<SVGSVGElement>('.veloxmd-chart-svg')
    expect(svg?.dataset.chartStatic).toBe('true')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 960 280')
    expect(svg?.querySelector('.veloxmd-chart-title')?.textContent).toBe('Readable data')
    expect(container.querySelector('canvas')).toBeNull()

    const edit = container.querySelector<HTMLButtonElement>('.veloxmd-visual-source-button')
    expect(edit?.textContent).toBe('Editar')
    edit?.click()
    expect(container.querySelector('.veloxmd-chart-svg')).toBeNull()

    const titleLine = container.querySelector<HTMLElement>('[data-line="5"]')!
    titleLine.textContent = '  "title": "Edited chart",'
    titleLine.dispatchEvent(new Event('input', { bubbles: true }))
    expect(editor.getValue()).toContain('"title": "Edited chart"')

    editor.setViewMode('source')
    editor.setViewMode('hybrid')
    expect(container.querySelector('.veloxmd-chart-title')?.textContent).toBe('Edited chart')
  })
})
