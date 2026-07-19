import { describe, expect, it } from 'vitest'
import { parseLiveDocumentPlus } from '../src/parse-block-plus'
import { renderLineElementPlus } from '../src/render-plus'
import {
  extractTableData,
  findTableBlockRange,
  renderStaticTable,
  renderStaticTableBlockAt,
  setupHybridTableOverlays,
} from '../src/features/tables'

describe('renderStaticTable', () => {
  it('renders inline markdown formatting inside table cells', () => {
    const lines = parseLiveDocumentPlus([
      '| **Etiqueta** | Estado |',
      '| --- | --- |',
      '| **Verificado** | Hecho constatado. |',
    ])
    const table = renderStaticTable(extractTableData(lines))

    const header = table.querySelector('th strong')
    const bodyCell = table.querySelector('tbody td strong')

    expect(header?.textContent).toBe('Etiqueta')
    expect(bodyCell?.textContent).toBe('Verificado')
    expect(table.textContent).not.toContain('**')
  })

  it('keeps literal HTML escaped while rendering table inline markdown', () => {
    const lines = parseLiveDocumentPlus([
      '| Label |',
      '| --- |',
      '| **<script>** |',
    ])
    const table = renderStaticTable(extractTableData(lines))
    const strong = table.querySelector('tbody td strong')

    expect(strong?.textContent).toBe('<script>')
    expect(strong?.querySelector('script')).toBeNull()
  })

  it('owns table block ranges and static viewer grouping inside the feature', () => {
    const lines = parseLiveDocumentPlus([
      'before',
      '| Name | State |',
      '| :--- | ---: |',
      '| 東京 | ready |',
      'after',
    ])

    expect(findTableBlockRange(lines, 2)).toEqual([1, 4])
    const block = renderStaticTableBlockAt(lines, 1)
    expect(block?.end).toBe(4)
    expect(block?.element.querySelector('tbody td')?.textContent).toBe('東京')
    expect(renderStaticTableBlockAt(lines, 0)).toBeNull()
  })

  it('mounts and activates the hybrid table overlay without reparsing DOM text', () => {
    const lines = parseLiveDocumentPlus([
      '| Name | State |',
      '| :--- | ---: |',
      '| 東京 | ready |',
    ])
    const root = document.createElement('div')
    for (let index = 0; index < lines.length; index++) {
      root.appendChild(renderLineElementPlus(lines[index], index))
    }

    let activated: [number, number] | null = null
    setupHybridTableOverlays({
      root,
      parsedLines: lines,
      scanStart: 1,
      scanEnd: 2,
      onActivate: (start, end) => { activated = [start, end] },
    })

    const overlay = root.querySelector('.veloxmd-table-overlay') as HTMLElement | null
    expect(overlay?.dataset.tableStart).toBe('0')
    expect(root.querySelector<HTMLElement>('[data-line="0"]')?.style.display).toBe('none')

    overlay?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(activated).toEqual([0, 3])
    expect(root.querySelector('.veloxmd-table-overlay')).toBeNull()
    expect(root.querySelector<HTMLElement>('[data-line="0"]')?.style.display).toBe('')
  })
})
