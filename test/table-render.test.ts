import { describe, expect, it } from 'vitest'
import { parseLiveDocumentPlus } from '../src/parse-block-plus'
import { extractTableData, renderStaticTable } from '../src/table-render'

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
})
