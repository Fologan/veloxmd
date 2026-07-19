import type { LiveLine } from '../../types.js'

export const TABLE_MARKDOWN_TEMPLATE = '| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |'
export const TABLE_SEPARATOR_LINE_CLASS = 'live-table-separator'

const TABLE_LINE_CLASS_BY_TYPE: Readonly<Record<string, string>> = {
  'table-header': 'live-table-header',
  'table-separator': TABLE_SEPARATOR_LINE_CLASS,
  'table-row': 'live-table-row',
}

export function tableLineClass(blockType: string): string | null {
  return TABLE_LINE_CLASS_BY_TYPE[blockType] ?? null
}

export function isTableBlockType(blockType: string): boolean {
  return tableLineClass(blockType) !== null
}

export function isTableHeaderBlock(blockType: string | undefined): boolean {
  return blockType === 'table-header'
}

export function findTableBlockRange(
  lines: ReadonlyArray<Pick<LiveLine, 'blockType'>>,
  lineIndex: number,
): [number, number] | null {
  if (!lines[lineIndex] || !isTableBlockType(lines[lineIndex].blockType)) return null

  let start = lineIndex
  while (start > 0 && isTableBlockType(lines[start - 1].blockType)) start--

  let end = lineIndex + 1
  while (end < lines.length && isTableBlockType(lines[end].blockType)) end++

  return [start, end]
}
