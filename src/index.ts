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

// Cursor utilities
export { getFlatOffset, setFlatOffset } from './cursor.js'
