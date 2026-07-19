export const DEFAULT_TABLE_FONT = "14px 'Cascadia Code','Fira Code','JetBrains Mono','SF Mono',Consolas,monospace"
export const TABLE_TAB_SIZE = 2

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const WIDE_RE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|[\u{1F000}-\u{1FAFF}]|[\u{20000}-\u{3FFFD}]/u
const ZERO_RE = /^[\u0300-\u036F\u200B-\u200D\uFE0E\uFE0F]+$/u

export type UnicodeWidthMode = 'measured' | 'standard'

export type UnicodeWidthMetrics = {
  hits: number
  misses: number
  entries: number
  backend: 'dom' | 'canvas'
  styleSignature: string
}

export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(String(text || '')), item => item.segment)
}

export function graphemeLen(text: string): number {
  let length = 0
  for (const _unused of segmenter.segment(String(text || ''))) length++
  return length
}

export function graphemeIdxToOffset(text: string, graphemeIndex: number): number {
  const source = String(text || '')
  let index = 0
  let offset = 0
  for (const item of segmenter.segment(source)) {
    if (index >= graphemeIndex) return offset
    offset += item.segment.length
    index++
  }
  return offset
}

export function offsetToGraphemeIdx(text: string, offset: number): number {
  const source = String(text || '')
  const limit = Math.max(0, Math.min(offset, source.length))
  let index = 0
  for (const item of segmenter.segment(source)) {
    if (item.index >= limit) return index
    if (item.index + item.segment.length >= limit) return index + 1
    index++
  }
  return index
}

export class UnicodeWidthMeasurer {
  private mode: UnicodeWidthMode = 'measured'
  private canvasContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
  private canvasFont = DEFAULT_TABLE_FONT
  private domMeasurer: HTMLSpanElement | null = null
  private domStyleSignature = ''
  private spaceWidth = 0
  private hits = 0
  private misses = 0
  private measuredCache = new Map<string, number>()
  private standardCache = new Map<string, number>()

  setMode(mode: UnicodeWidthMode | undefined): void {
    this.mode = mode === 'standard' ? 'standard' : 'measured'
  }

  getMode(): UnicodeWidthMode {
    return this.mode
  }

  configureFont(font: string): void {
    if (font === this.canvasFont && this.spaceWidth) return
    this.canvasFont = font || DEFAULT_TABLE_FONT
    this.domStyleSignature = `canvas|${this.canvasFont}`
    this.measuredCache.clear()
    const context = this.context()
    context.font = this.canvasFont
    this.spaceWidth = context.measureText(' ').width || context.measureText('M').width || 8.4
  }

  configureFromElement(element: Element, force = false): boolean {
    const measurer = this.ensureDOMMeasurer()
    if (!measurer || typeof getComputedStyle === 'undefined') return false
    const style = getComputedStyle(element)
    const signature = [
      style.fontFamily,
      style.fontSize,
      style.fontStyle,
      style.fontWeight,
      style.fontStretch,
      style.fontVariant,
      style.fontVariantLigatures,
      style.fontFeatureSettings,
      style.fontKerning,
      style.letterSpacing,
      style.wordSpacing,
    ].join('|')
    if (!force && signature === this.domStyleSignature && this.spaceWidth) return true

    Object.assign(measurer.style, {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontStyle: style.fontStyle,
      fontWeight: style.fontWeight,
      fontStretch: style.fontStretch,
      fontVariant: style.fontVariant,
      fontVariantLigatures: style.fontVariantLigatures,
      fontFeatureSettings: style.fontFeatureSettings,
      fontKerning: style.fontKerning,
      letterSpacing: style.letterSpacing,
      wordSpacing: style.wordSpacing,
    })
    this.canvasFont = style.font || `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    this.domStyleSignature = signature
    this.measuredCache.clear()
    measurer.textContent = ' '
    this.spaceWidth = measurer.getBoundingClientRect().width || 0
    if (!this.spaceWidth) {
      const context = this.context()
      context.font = this.canvasFont || DEFAULT_TABLE_FONT
      this.spaceWidth = context.measureText(' ').width || context.measureText('M').width || 8.4
    }
    return true
  }

  displayWidth(text: string): number {
    const source = String(text || '')
    if (!source) return 0
    if (this.mode === 'standard') {
      let width = 0
      for (const item of segmenter.segment(source)) width += this.standardGraphemeWidth(item.segment)
      return width
    }

    const cached = this.measuredCache.get(source)
    if (cached !== undefined) {
      this.hits++
      return cached
    }
    const width = this.measuredPixels(source) / (this.spaceWidth || 1)
    this.measuredCache.set(source, width)
    this.misses++
    return width
  }

  resetMetrics(): void {
    this.hits = 0
    this.misses = 0
  }

  metrics(): UnicodeWidthMetrics {
    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.measuredCache.size + this.standardCache.size,
      backend: this.domMeasurer?.isConnected ? 'dom' : 'canvas',
      styleSignature: this.domStyleSignature,
    }
  }

  warmUp(): void {
    if (this.mode === 'measured') this.context()
  }

  destroy(): void {
    this.domMeasurer?.remove()
    this.domMeasurer = null
    this.measuredCache.clear()
  }

  private context(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
    if (this.canvasContext) return this.canvasContext
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvasContext = new OffscreenCanvas(1, 1).getContext('2d')
    } else if (typeof document !== 'undefined') {
      this.canvasContext = document.createElement('canvas').getContext('2d')
    }
    if (!this.canvasContext) {
      throw new Error('Measured table widths require Canvas. Use standard mode outside a browser.')
    }
    this.canvasContext.font = this.canvasFont
    if (!this.spaceWidth) {
      this.spaceWidth = this.canvasContext.measureText(' ').width || this.canvasContext.measureText('M').width || 8.4
    }
    return this.canvasContext
  }

  private ensureDOMMeasurer(): HTMLSpanElement | null {
    if (this.domMeasurer?.isConnected) return this.domMeasurer
    if (typeof document === 'undefined' || !document.body) return null
    const measurer = document.createElement('span')
    measurer.setAttribute('aria-hidden', 'true')
    Object.assign(measurer.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      display: 'inline-block',
      visibility: 'hidden',
      whiteSpace: 'pre',
      padding: '0',
      border: '0',
      margin: '0',
      lineHeight: 'normal',
      pointerEvents: 'none',
    })
    document.body.appendChild(measurer)
    this.domMeasurer = measurer
    return measurer
  }

  private measuredPixels(source: string): number {
    if (this.domMeasurer?.isConnected && this.spaceWidth) {
      this.domMeasurer.textContent = source
      const width = this.domMeasurer.getBoundingClientRect().width
      if (width) return width
    }
    const context = this.context()
    context.font = this.canvasFont
    return context.measureText(source).width
  }

  private standardGraphemeWidth(grapheme: string): number {
    const cached = this.standardCache.get(grapheme)
    if (cached !== undefined) {
      this.hits++
      return cached
    }
    const width = ZERO_RE.test(grapheme)
      ? 0
      : WIDE_RE.test(grapheme) || /\p{Extended_Pictographic}/u.test(grapheme)
        ? 2
        : 1
    this.standardCache.set(grapheme, width)
    this.misses++
    return width
  }
}

export const defaultTableWidthMeasurer = new UnicodeWidthMeasurer()

export function initTableCanvas(font: string): void {
  defaultTableWidthMeasurer.configureFont(font)
}

export function displayWidth(text: string): number {
  return defaultTableWidthMeasurer.displayWidth(text)
}

export function displayWidthToGraphemeIdx(text: string, column: number): number {
  let width = 0
  let index = 0
  for (const item of segmenter.segment(text)) {
    if (width >= column) return index
    width += defaultTableWidthMeasurer.displayWidth(item.segment)
    index++
  }
  return index
}

export function graphemeIdxToDisplayWidth(text: string, graphemeIndex: number): number {
  let width = 0
  let index = 0
  for (const item of segmenter.segment(text)) {
    if (index >= graphemeIndex) break
    width += defaultTableWidthMeasurer.displayWidth(item.segment)
    index++
  }
  return width
}
