export type TableAlign = 'left' | 'center' | 'right' | 'justify'

export interface TableModel {
  headers: string[]
  rows: string[][]
  colAligns: TableAlign[]
  rowAligns: Record<number, TableAlign>
}

export interface TableBorder {
  tl: string
  t: string
  tc: string
  tr: string
  ml: string
  m: string
  mc: string
  mr: string
  bl: string
  b: string
  bc: string
  br: string
  v: string
  wrap: boolean
}

export const TABLE_BORDERS = {
  markdown: { tl: '|', t: '-', tc: '|', tr: '|', ml: '|', m: '-', mc: '|', mr: '|', bl: '|', b: '-', bc: '|', br: '|', v: '|', wrap: false },
  box: { tl: '┌', t: '─', tc: '┬', tr: '┐', ml: '├', m: '─', mc: '┼', mr: '┤', bl: '└', b: '─', bc: '┴', br: '┘', v: '│', wrap: true },
  double: { tl: '╔', t: '═', tc: '╦', tr: '╗', ml: '╠', m: '═', mc: '╬', mr: '╣', bl: '╚', b: '═', bc: '╩', br: '╝', v: '║', wrap: true },
  ascii: { tl: '+', t: '-', tc: '+', tr: '+', ml: '+', m: '-', mc: '+', mr: '+', bl: '+', b: '-', bc: '+', br: '+', v: '|', wrap: true },
} as const satisfies Record<string, TableBorder>

export type TableBorderKey = keyof typeof TABLE_BORDERS

export interface TableCellPos {
  row: number
  col: number
  li: number
  start: number
  end: number
  textStart: number
  textEnd: number
  w: number
  abs: number
  absEnd: number
  absTextStart: number
  absTextEnd: number
}

export interface TableRenderResult {
  text: string
  cellMap: TableCellPos[]
  colW: number[]
  colSpans: number[]
  colModes: Array<'spaces' | 'anchor'>
  anchors: number[]
  ms: [number, number]
}

export interface PortableTableRenderResult {
  text: string
  colW: number[]
  format: 'portable-cell-v1'
  unicodeProfile: 'wcwidth-grapheme-v1'
}
