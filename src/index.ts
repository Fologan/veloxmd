// =============================================================================
// FastMD — Public API
// =============================================================================

// Editor classes
export { LiveEditor } from './editor.js'
export type { EditorOptions } from './editor.js'
export { LiveEditorPlus } from './editorPlus.js'

// Toolbar
export { Toolbar } from './toolbar.js'

// Viewer (static read-only)
export { LiveViewer } from './viewer.js'

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
export { extractTableData, renderStaticTable } from './table-render.js'
export type { TableModel, TableAlign } from './table-render.js'

// Table engine (advanced)
export {
  createTableModel, renderTableText,
  graphemeLen, displayWidth,
  cursorToTableCell, tableCellToCursor, nearestTableCell,
  TABLE_BORDERS,
} from './table-engine.js'
export type { TableCellPos, TableRenderResult } from './table-engine.js'

// Table toolbar
export { TableToolbar } from './table-toolbar.js'
export type { TableAction } from './table-toolbar.js'

// Cursor utilities
export { getFlatOffset, setFlatOffset } from './cursor.js'
