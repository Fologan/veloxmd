// =============================================================================
// VeloxMD Types — shared across base and plus modules
// =============================================================================

/** Block-level element types (base) */
export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'code-block-open'
  | 'code-block-line'
  | 'code-block-close'
  | 'blockquote'
  | 'unordered-list'
  | 'ordered-list'
  | 'horizontal-rule'
  | 'empty'

/** Extended block types (plus) */
export type BlockTypePlus =
  | BlockType
  | 'table-header'
  | 'table-separator'
  | 'table-row'
  | 'task-list'
  | 'alt-heading'
  | 'alt-heading-marker'
  | 'footnote-def'
  | 'html-comment'
  | 'details-open'
  | 'details-summary'
  | 'details-close'

/** Inline segment kinds (base) */
export type LiveSegmentKind =
  | 'text'
  | 'syntax'
  | 'bold'
  | 'italic'
  | 'bold-italic'
  | 'code'
  | 'strikethrough'
  | 'link-text'
  | 'link-url'

/** Extended inline segment kinds (plus) */
export type LiveSegmentKindPlus =
  | LiveSegmentKind
  | 'task-checkbox'
  | 'footnote-ref'
  | 'footnote-label'
  | 'autolink'
  | 'html-tag'
  | 'highlight'
  | 'keyboard'
  | 'underline'
  | 'superscript'
  | 'subscript'
  | 'math-inline'
  | 'ref-link-text'
  | 'ref-link-label'
  | 'link-title'
  | 'hard-break'
  | 'image-alt'
  | 'image-url'

/** A segment of inline content with its kind */
export interface LiveSegment {
  text: string
  kind: LiveSegmentKind | LiveSegmentKindPlus
}

/** A parsed line — block type + inline segments */
export interface LiveLine {
  raw: string
  blockType: BlockType | BlockTypePlus
  blockLevel?: number
  segments: LiveSegment[]
  lang?: string
  tableAlignments?: ('left' | 'center' | 'right' | 'default')[]
}

/** Editor view modes */
export type ViewMode = 'source' | 'hybrid'

/** Multi-line parse state (used by plus block parser) */
export interface ParseState {
  inCodeBlock: boolean
  inTable: boolean
  inMathBlock: boolean
  tableAlignments: ('left' | 'center' | 'right' | 'default')[]
}
