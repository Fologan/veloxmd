// =============================================================================
// VeloxMD — Public API
// =============================================================================

// Editor classes
export { LiveEditor } from './editor.js'
export type { EditorOptions } from './editor.js'
export { LiveEditorPlus } from './editorPlus.js'

// Toolbar
export { Toolbar } from './toolbar.js'

// Viewer (static read-only)
export { LiveViewer } from './viewer.js'
export type { ViewerOptions } from './viewer.js'

// Hybrid mode
export { HybridController } from './hybrid.js'

// Types
export type {
  BlockType,
  BlockTypePlus,
  LiveSegmentKind,
  LiveSegmentKindPlus,
  LiveSegment,
  LiveLine,
  ViewMode,
  ParseState,
} from './types.js'

// Block parsers
export { parseLiveDocument } from './parse-block.js'
export { parseLiveDocumentPlus } from './parse-block-plus.js'

// Inline parsers
export { parseLiveInline } from './parse-inline.js'
export { parseLiveInlinePlus } from './parse-inline-plus.js'

// Renderers
export { createSegmentNode, renderLineElement } from './render.js'
export { createSegmentNodePlus, renderLineElementPlus } from './render-plus.js'

// Table engine
export { extractTableData, renderStaticTable } from './features/tables/index.js'
export type { TableModel, TableAlign } from './features/tables/index.js'

// Table engine (advanced)
export {
  createTableModel, renderTableText,
  graphemeLen, graphemes, graphemeIdxToOffset, offsetToGraphemeIdx, displayWidth,
  cursorToTableCell, tableCellToCursor, nearestTableCell,
  TABLE_BORDERS,
  renderPortableTable, wrapPortableTableCodeBlock,
  portableCellWidth, normalizeTableCell,
  portableTableText, portableTableCode, portableTableTextForSelection,
  UnicodeWidthMeasurer, TABLE_TAB_SIZE,
} from './features/tables/index.js'
export type { TableCellPos, TableRenderResult, PortableTableRenderResult, TableBorderKey } from './features/tables/index.js'

// Table toolbar
export { TableToolbar } from './features/tables/index.js'
export type { TableAction } from './features/tables/index.js'

// Table edit controller
export { TableEditController } from './features/tables/index.js'

// Cursor utilities
export { getFlatOffset, setFlatOffset } from './cursor.js'

// Interactive visual block features
export { parseBoard, serializeBoard, moveBoardCard } from './features/board/index.js'
export type { BoardCard, BoardColumn, BoardModel, BoardParseResult } from './features/board/index.js'
export { parseChart, serializeChart, updateChartValue } from './features/chart/index.js'
export type { ChartKind, ChartParseResult, ChartSeries, ChartSpec } from './features/chart/index.js'
