import { describe, it, expect } from 'vitest'
import { parseLiveDocumentPlus } from '../src/parse-block-plus'

describe('parseLiveDocumentPlus', () => {
  it('parses table with header, separator, and rows', () => {
    const lines = parseLiveDocumentPlus([
      '| Name | Age |',
      '| --- | --- |',
      '| Alice | 30 |',
    ])
    expect(lines[0].blockType).toBe('table-header')
    expect(lines[1].blockType).toBe('table-separator')
    expect(lines[2].blockType).toBe('table-row')
  })

  it('parses table alignments', () => {
    const lines = parseLiveDocumentPlus([
      '| L | C | R |',
      '| :--- | :---: | ---: |',
      '| a | b | c |',
    ])
    expect(lines[1].tableAlignments).toEqual(['left', 'center', 'right'])
  })

  it('exits table on non-pipe line', () => {
    const lines = parseLiveDocumentPlus([
      '| H |',
      '| --- |',
      '| R |',
      'not a table',
    ])
    expect(lines[3].blockType).toBe('paragraph')
  })

  it('parses task list checked', () => {
    const [line] = parseLiveDocumentPlus(['- [x] done'])
    expect(line.blockType).toBe('task-list')
    const checkbox = line.segments.find(s => s.kind === 'task-checkbox')
    expect(checkbox?.text).toBe('x')
  })

  it('parses task list unchecked', () => {
    const [line] = parseLiveDocumentPlus(['- [ ] todo'])
    expect(line.blockType).toBe('task-list')
    const checkbox = line.segments.find(s => s.kind === 'task-checkbox')
    expect(checkbox?.text).toBe(' ')
  })

  it('parses nested blockquotes with depth', () => {
    const [line] = parseLiveDocumentPlus(['> > > deep'])
    expect(line.blockType).toBe('blockquote')
    expect(line.blockLevel).toBe(3)
  })

  it('parses alt heading with ===', () => {
    const lines = parseLiveDocumentPlus(['Title', '==='])
    expect(lines[0].blockType).toBe('alt-heading')
    expect(lines[0].blockLevel).toBe(1)
    expect(lines[1].blockType).toBe('alt-heading-marker')
  })

  it('parses alt heading with ---', () => {
    const lines = parseLiveDocumentPlus(['Title', '---'])
    expect(lines[0].blockType).toBe('alt-heading')
    expect(lines[0].blockLevel).toBe(2)
    expect(lines[1].blockType).toBe('alt-heading-marker')
  })

  it('parses footnote definition', () => {
    const [line] = parseLiveDocumentPlus(['[^1]: Some note'])
    expect(line.blockType).toBe('footnote-def')
    const label = line.segments.find(s => s.kind === 'footnote-label')
    expect(label?.text).toBe('1')
  })

  it('parses HTML comment', () => {
    const [line] = parseLiveDocumentPlus(['<!-- comment -->'])
    expect(line.blockType).toBe('html-comment')
  })

  it('parses details open/close', () => {
    const lines = parseLiveDocumentPlus([
      '<details>',
      '<summary>Click me</summary>',
      'Content here',
      '</details>',
    ])
    expect(lines[0].blockType).toBe('details-open')
    expect(lines[1].blockType).toBe('details-summary')
    expect(lines[2].blockType).toBe('paragraph')
    expect(lines[3].blockType).toBe('details-close')
  })

  it('parses math block with $$', () => {
    const lines = parseLiveDocumentPlus(['$$', 'E = mc^2', '$$'])
    expect(lines[0].blockType).toBe('code-block-open')
    expect(lines[0].lang).toBe('math')
    expect(lines[1].blockType).toBe('code-block-line')
    expect(lines[2].blockType).toBe('code-block-close')
  })

  it('parses reference link definition', () => {
    const [line] = parseLiveDocumentPlus(['[ref]: https://example.com'])
    expect(line.blockType).toBe('paragraph')
    const label = line.segments.find(s => s.kind === 'ref-link-label')
    expect(label?.text).toBe('ref')
    const url = line.segments.find(s => s.kind === 'link-url')
    expect(url?.text).toBe('https://example.com')
  })

  it('does not confuse --- after heading text with horizontal rule', () => {
    const lines = parseLiveDocumentPlus(['My Title', '---'])
    expect(lines[0].blockType).toBe('alt-heading')
    expect(lines[1].blockType).toBe('alt-heading-marker')
  })

  it('still parses standalone --- as horizontal rule', () => {
    const lines = parseLiveDocumentPlus(['', '---', ''])
    expect(lines[1].blockType).toBe('horizontal-rule')
  })
})
