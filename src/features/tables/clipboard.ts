import type { LiveLine } from '../../types.js'
import { extractTableData, isCompleteTableSelection } from './parse.js'
import { renderPortableTable, wrapPortableTableCodeBlock } from './portable-render.js'
import type { TableModel } from './types.js'

export type TableDocumentParser = (rawLines: string[]) => LiveLine[]

export function portableTableText(table: TableModel): string {
  return renderPortableTable(table, { borderKey: 'markdown' }).text
}

export function portableTableCode(table: TableModel): string {
  return wrapPortableTableCodeBlock(portableTableText(table), 'text')
}

export function portableTableTextForSelection(
  selectedText: string,
  parseDocument: TableDocumentParser,
): string | null {
  const normalized = String(selectedText || '').replace(/\r\n?/g, '\n')
  const rawLines = normalized.endsWith('\n')
    ? normalized.slice(0, -1).split('\n')
    : normalized.split('\n')
  const parsed = parseDocument(rawLines)
  if (!isCompleteTableSelection(parsed)) return null
  return portableTableText(extractTableData(parsed))
}

export async function writeTableClipboard(text: string): Promise<void> {
  if (!globalThis.navigator?.clipboard?.writeText) {
    throw new Error('Clipboard API is not available')
  }
  await globalThis.navigator.clipboard.writeText(text)
}
