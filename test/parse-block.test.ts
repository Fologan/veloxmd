import { describe, it, expect } from 'vitest'
import { parseLiveDocument } from '../src/parse-block'

describe('parseLiveDocument', () => {
  it('parses empty line', () => {
    const [line] = parseLiveDocument([''])
    expect(line.blockType).toBe('empty')
    expect(line.segments).toEqual([])
  })

  it('parses headings h1-h6', () => {
    for (let level = 1; level <= 6; level++) {
      const prefix = '#'.repeat(level) + ' '
      const [line] = parseLiveDocument([prefix + 'Title'])
      expect(line.blockType).toBe('heading')
      expect(line.blockLevel).toBe(level)
      expect(line.segments[0]).toEqual({ text: prefix, kind: 'syntax' })
    }
  })

  it('parses blockquote', () => {
    const [line] = parseLiveDocument(['> quoted text'])
    expect(line.blockType).toBe('blockquote')
    expect(line.segments[0]).toEqual({ text: '> ', kind: 'syntax' })
  })

  it('parses unordered list with - * +', () => {
    for (const marker of ['- ', '* ', '+ ']) {
      const [line] = parseLiveDocument([marker + 'item'])
      expect(line.blockType).toBe('unordered-list')
      expect(line.segments[0].kind).toBe('syntax')
    }
  })

  it('parses ordered list', () => {
    const [line] = parseLiveDocument(['1. item'])
    expect(line.blockType).toBe('ordered-list')
    expect(line.segments[0]).toEqual({ text: '1. ', kind: 'syntax' })
  })

  it('parses nested list indentation', () => {
    const [line] = parseLiveDocument(['    - nested'])
    expect(line.blockType).toBe('unordered-list')
    expect(line.blockLevel).toBe(2)
  })

  it('parses horizontal rule', () => {
    for (const rule of ['---', '***', '___', '- - -']) {
      const [line] = parseLiveDocument([rule])
      expect(line.blockType).toBe('horizontal-rule')
    }
  })

  it('parses code block open/close', () => {
    const lines = parseLiveDocument(['```js', 'const x = 1', '```'])
    expect(lines[0].blockType).toBe('code-block-open')
    expect(lines[0].lang).toBe('js')
    expect(lines[1].blockType).toBe('code-block-line')
    expect(lines[1].segments[0].kind).toBe('code')
    expect(lines[2].blockType).toBe('code-block-close')
  })

  it('does not parse markdown inside code blocks', () => {
    const lines = parseLiveDocument(['```', '# not a heading', '```'])
    expect(lines[1].blockType).toBe('code-block-line')
    expect(lines[1].segments[0].kind).toBe('code')
  })

  it('parses paragraph as fallback', () => {
    const [line] = parseLiveDocument(['just some text'])
    expect(line.blockType).toBe('paragraph')
  })

  it('preserves raw text on every line', () => {
    const raw = '## Hello **world**'
    const [line] = parseLiveDocument([raw])
    expect(line.raw).toBe(raw)
  })
})
