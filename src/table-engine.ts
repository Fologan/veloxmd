// table-engine.ts — Plain-text table engine with canvas measurement
// Grapheme-correct via Intl.Segmenter. Canvas measureText for monospace width.

/** Alignment type for table cells. */
export type TableAlign = 'left' | 'center' | 'right' | 'justify';

/** Represents a plain-text table with headers, rows, and alignment settings. */
export interface TableModel {
  headers: string[];
  rows: string[][];
  colAligns: TableAlign[];
  rowAligns: Record<number, TableAlign>; // sparse, -1 = header row
}

/** Position descriptor for a single cell within the rendered table text. */
export interface TableCellPos {
  row: number; col: number; li: number;
  start: number; w: number; abs: number; absEnd: number;
}

/** Result of rendering a table to plain text. */
export interface TableRenderResult {
  text: string;
  cellMap: TableCellPos[];
  colW: number[];
}

// -- Grapheme helpers --
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Returns the number of grapheme clusters in the given string.
 * @param s - Input string
 * @returns Grapheme count
 */
export const graphemeLen = (s: string): number => { let n = 0; for (const _ of segmenter.segment(s)) n++; return n; };

/**
 * Converts a grapheme index to a UTF-16 code-unit offset within the string.
 * @param s - Input string
 * @param gi - Grapheme index
 * @returns Code-unit offset
 */
export const graphemeIdxToOffset = (s: string, gi: number): number => {
  let i = 0, o = 0;
  for (const x of segmenter.segment(s)) { if (i >= gi) return o; o += x.segment.length; i++; }
  return o;
};

// -- Canvas measurement with cache --
let canvasCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
let referenceWidth = 8.4;
const widthCache = new Map<string, number>();

/**
 * Initialises the internal canvas context used for measuring grapheme display widths.
 * @param font - CSS font string (e.g. "14px monospace")
 */
export function initTableCanvas(font: string): void {
  canvasCtx = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(1, 1).getContext('2d')!
    : document.createElement('canvas').getContext('2d')!;
  canvasCtx.font = font;
  referenceWidth = canvasCtx.measureText('M').width || 8.4;
}

function graphemeWidth(g: string): number {
  let w = widthCache.get(g);
  if (w !== undefined) return w;
  if (!canvasCtx) initTableCanvas("14px monospace");
  canvasCtx!.font = canvasCtx!.font; // ensure set
  w = Math.max(1, Math.round(canvasCtx!.measureText(g).width / referenceWidth));
  widthCache.set(g, w);
  return w;
}

/**
 * Returns the display width of a string in monospace columns, accounting for
 * wide characters measured via canvas.
 * @param s - Input string
 * @returns Column width
 */
export function displayWidth(s: string): number {
  if (!s) return 0;
  let w = 0;
  for (const x of segmenter.segment(s)) w += graphemeWidth(x.segment);
  return w;
}

/**
 * Converts a display-width column position to a grapheme index within the string.
 * @param s - Input string
 * @param col - Display-width column
 * @returns Grapheme index
 */
export function displayWidthToGraphemeIdx(s: string, col: number): number {
  let w = 0, gi = 0;
  for (const x of segmenter.segment(s)) { if (w >= col) return gi; w += graphemeWidth(x.segment); gi++; }
  return gi;
}

/**
 * Converts a grapheme index to a display-width column offset.
 * @param s - Input string
 * @param gi - Grapheme index
 * @returns Display-width offset
 */
export function graphemeIdxToDisplayWidth(s: string, gi: number): number {
  let w = 0, i = 0;
  for (const x of segmenter.segment(s)) { if (i >= gi) break; w += graphemeWidth(x.segment); i++; }
  return w;
}

// -- Border styles --
interface Border { tl:string;t:string;tc:string;tr:string;ml:string;m:string;mc:string;mr:string;bl:string;b:string;bc:string;br:string;v:string;wrap:boolean }
export const TABLE_BORDERS: Record<string, Border> = {
  markdown: { tl:'|',t:'-',tc:'|',tr:'|',ml:'|',m:'-',mc:'|',mr:'|',bl:'|',b:'-',bc:'|',br:'|',v:'|',wrap:false },
  box:      { tl:'\u250c',t:'\u2500',tc:'\u252c',tr:'\u2510',ml:'\u251c',m:'\u2500',mc:'\u253c',mr:'\u2524',bl:'\u2514',b:'\u2500',bc:'\u2534',br:'\u2518',v:'\u2502',wrap:true },
  double:   { tl:'\u2554',t:'\u2550',tc:'\u2566',tr:'\u2557',ml:'\u2560',m:'\u2550',mc:'\u256c',mr:'\u2563',bl:'\u255a',b:'\u2550',bc:'\u2569',br:'\u255d',v:'\u2551',wrap:true },
  ascii:    { tl:'+',t:'-',tc:'+',tr:'+',ml:'+',m:'-',mc:'+',mr:'+',bl:'+',b:'-',bc:'+',br:'+',v:'|',wrap:true },
};

// -- Table helpers --

/**
 * Creates a new empty table model with the given headers and optional column alignments.
 * @param headers - Column header strings
 * @param colAligns - Optional per-column alignment (defaults to 'left')
 * @returns A new TableModel
 */
export function createTableModel(headers: string[], colAligns?: TableAlign[]): TableModel {
  return {
    headers: [...headers],
    rows: [],
    colAligns: headers.map((_, i) => colAligns?.[i] ?? 'left'),
    rowAligns: {},
  };
}

/**
 * Returns the effective alignment for a cell, checking row override first, then column default.
 * @param t - Table model
 * @param r - Row index (-1 for header)
 * @param c - Column index
 * @returns Effective alignment
 */
export function getTableCellAlign(t: TableModel, r: number, c: number): TableAlign {
  return t.rowAligns[r] ?? t.colAligns[c] ?? 'left';
}

/**
 * Retrieves the text content of a cell. Row -1 reads from the header row.
 * @param t - Table model
 * @param r - Row index (-1 for header)
 * @param c - Column index
 * @returns Cell text
 */
export function getTableCell(t: TableModel, r: number, c: number): string {
  return r === -1 ? (t.headers[c] ?? '') : (t.rows[r]?.[c] ?? '');
}

/**
 * Sets the text content of a cell. Row -1 writes to the header row.
 * @param t - Table model
 * @param r - Row index (-1 for header)
 * @param c - Column index
 * @param v - New cell text
 */
export function setTableCell(t: TableModel, r: number, c: number, v: string): void {
  if (r === -1) t.headers[c] = v;
  else if (t.rows[r]) t.rows[r][c] = v;
}

// -- Pad --
function padCell(text: string, w: number, align: TableAlign): string {
  const tw = displayWidth(text), gap = w - tw;
  if (gap <= 0) return text;
  if (align === 'right') return ' '.repeat(gap) + text;
  if (align === 'center') { const l = Math.floor(gap / 2); return ' '.repeat(l) + text + ' '.repeat(gap - l); }
  if (align === 'justify' && text.includes(' ')) {
    const parts = text.split(' ');
    if (parts.length < 2) return text + ' '.repeat(gap);
    const slots = parts.length - 1, base = Math.floor(gap / slots), extra = gap % slots;
    let out = parts[0];
    for (let i = 1; i < parts.length; i++) out += ' '.repeat(1 + base + (i <= extra ? 1 : 0)) + parts[i];
    return out;
  }
  return text + ' '.repeat(gap);
}

// -- Render --

/**
 * Renders a TableModel to plain text with the specified border style.
 * Returns the rendered text, a cell position map, and computed column widths.
 * @param t - Table model to render
 * @param borderKey - Border style key (default 'markdown')
 * @returns Rendered text, cell map, and column widths
 */
export function renderTableText(t: TableModel, borderKey = 'markdown'): TableRenderResult {
  const cc = t.headers.length;
  if (!cc) return { text: '', cellMap: [], colW: [] };
  const b = TABLE_BORDERS[borderKey] ?? TABLE_BORDERS.markdown;
  const isMd = borderKey === 'markdown';

  const colW = new Array(cc).fill(0);
  for (let c = 0; c < cc; c++) colW[c] = Math.max(colW[c], displayWidth(t.headers[c]));
  for (const row of t.rows) for (let c = 0; c < cc; c++) colW[c] = Math.max(colW[c], displayWidth(row[c] ?? ''));
  for (let c = 0; c < cc; c++) colW[c] = Math.max(colW[c], 3);

  const lines: string[] = [], cellMap: TableCellPos[] = [];

  function horizontalRule(pos: 'top' | 'mid' | 'bot'): string {
    const [lc, cc2, rc] = pos === 'top' ? [b.tl, b.tc, b.tr] : pos === 'mid' ? [b.ml, b.mc, b.mr] : [b.bl, b.bc, b.br];
    const ch = pos === 'top' ? b.t : pos === 'mid' ? b.m : b.b;
    return lc + colW.map((w: number) => ch.repeat(w + 2)).join(cc2) + rc;
  }

  function buildTableRow(cells: string[], ri: number): string {
    const li = lines.length;
    let ln = b.v;
    for (let c = 0; c < cc; c++) {
      const al = getTableCellAlign(t, ri, c);
      const padded = padCell(cells[c] ?? '', colW[c], al);
      const start = ln.length + 1;
      ln += ' ' + padded + ' ' + b.v;
      cellMap.push({ row: ri, col: c, li, start, w: colW[c], abs: 0, absEnd: 0 });
    }
    return ln;
  }

  if (b.wrap) lines.push(horizontalRule('top'));
  lines.push(buildTableRow(t.headers, -1));

  if (isMd) {
    let sep = '|';
    for (let c = 0; c < cc; c++) {
      const w = colW[c] + 2, a = t.colAligns[c] ?? 'left';
      if (a === 'center') sep += ':' + '-'.repeat(w - 2) + ':';
      else if (a === 'right') sep += '-'.repeat(w - 1) + ':';
      else if (a === 'justify') sep += '::' + '-'.repeat(Math.max(0, w - 4)) + '::';
      else sep += ':' + '-'.repeat(w - 1);
      sep += '|';
    }
    lines.push(sep);
  } else {
    lines.push(horizontalRule('mid'));
  }

  for (let r = 0; r < t.rows.length; r++) lines.push(buildTableRow(t.rows[r], r));
  if (b.wrap) lines.push(horizontalRule('bot'));

  const text = lines.join('\n');
  const ls: number[] = []; let off = 0;
  for (const l of lines) { ls.push(off); off += l.length + 1; }
  for (const cm of cellMap) { cm.abs = ls[cm.li] + cm.start; cm.absEnd = cm.abs + cm.w; }

  return { text, cellMap, colW };
}

// -- Cursor mapping --

/**
 * Maps an absolute cursor position in the rendered text to a table cell and grapheme index.
 * @param t - Table model
 * @param pos - Absolute character position in the rendered text
 * @param map - Cell position map from renderTableText
 * @returns Object with row, col, and grapheme index, or null if outside any cell
 */
export function cursorToTableCell(t: TableModel, pos: number, map: TableCellPos[]): { row: number; col: number; gi: number } | null {
  for (const cm of map) {
    if (pos >= cm.abs && pos <= cm.absEnd) {
      const txt = getTableCell(t, cm.row, cm.col);
      const tw = displayWidth(txt), al = getTableCellAlign(t, cm.row, cm.col);
      let tStart = 0;
      if (al === 'right') tStart = cm.w - tw;
      else if (al === 'center') tStart = Math.floor((cm.w - tw) / 2);
      const gi = displayWidthToGraphemeIdx(txt, Math.max(0, pos - cm.abs - tStart));
      return { row: cm.row, col: cm.col, gi: Math.min(gi, graphemeLen(txt)) };
    }
  }
  return null;
}

/**
 * Maps a table cell and grapheme index back to an absolute cursor position in the rendered text.
 * @param t - Table model
 * @param r - Row index (-1 for header)
 * @param c - Column index
 * @param gi - Grapheme index within the cell
 * @param map - Cell position map from renderTableText
 * @returns Absolute character position
 */
export function tableCellToCursor(t: TableModel, r: number, c: number, gi: number, map: TableCellPos[]): number {
  for (const cm of map) {
    if (cm.row === r && cm.col === c) {
      const txt = getTableCell(t, r, c), tw = displayWidth(txt), al = getTableCellAlign(t, r, c);
      let tStart = 0;
      if (al === 'right') tStart = cm.w - tw;
      else if (al === 'center') tStart = Math.floor((cm.w - tw) / 2);
      return cm.abs + tStart + graphemeIdxToDisplayWidth(txt, Math.min(gi, graphemeLen(txt)));
    }
  }
  return 0;
}

/**
 * Finds the cell whose centre is nearest to the given absolute cursor position.
 * @param pos - Absolute character position
 * @param map - Cell position map from renderTableText
 * @returns Nearest TableCellPos, or null if map is empty
 */
export function nearestTableCell(pos: number, map: TableCellPos[]): TableCellPos | null {
  let best: TableCellPos | null = null, bd = Infinity;
  for (const cm of map) { const d = Math.abs(pos - (cm.abs + cm.absEnd) / 2); if (d < bd) { bd = d; best = cm; } }
  return best;
}
