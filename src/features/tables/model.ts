import type { TableAlign, TableModel } from './types.js'

export function createTableModel(headers: string[], colAligns?: TableAlign[]): TableModel {
  return {
    headers: [...headers],
    rows: [],
    colAligns: headers.map((_, index) => colAligns?.[index] ?? 'left'),
    rowAligns: {},
  }
}

export function getTableCellAlign(table: TableModel, row: number, column: number): TableAlign {
  return table.rowAligns[row] ?? table.colAligns[column] ?? 'left'
}

export function getTableCell(table: TableModel, row: number, column: number): string {
  return row === -1 ? (table.headers[column] ?? '') : (table.rows[row]?.[column] ?? '')
}

export function setTableCell(table: TableModel, row: number, column: number, value: string): void {
  if (row === -1) table.headers[column] = value
  else if (table.rows[row]) table.rows[row][column] = value
}
