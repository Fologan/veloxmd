import { describe, it, expect } from 'vitest'
import { createSegmentNode, renderLineElement } from '../src/render'
import type { LiveLine, LiveSegment } from '../src/types'

describe('createSegmentNode', () => {
  it('creates syntax span', () => {
    const node = createSegmentNode({ text: '## ', kind: 'syntax' }) as HTMLElement
    expect(node.tagName).toBe('SPAN')
    expect(node.className).toBe('syntax')
    expect(node.textContent).toBe('## ')
  })

  it('creates bold <strong>', () => {
    const node = createSegmentNode({ text: 'bold', kind: 'bold' }) as HTMLElement
    expect(node.tagName).toBe('STRONG')
    expect(node.textContent).toBe('bold')
  })

  it('creates italic <em>', () => {
    const node = createSegmentNode({ text: 'italic', kind: 'italic' }) as HTMLElement
    expect(node.tagName).toBe('EM')
  })

  it('creates bold-italic <strong><em>', () => {
    const node = createSegmentNode({ text: 'both', kind: 'bold-italic' }) as HTMLElement
    expect(node.tagName).toBe('STRONG')
    expect(node.querySelector('em')?.textContent).toBe('both')
  })

  it('creates code <code>', () => {
    const node = createSegmentNode({ text: 'code', kind: 'code' }) as HTMLElement
    expect(node.tagName).toBe('CODE')
  })

  it('creates strikethrough <del>', () => {
    const node = createSegmentNode({ text: 'deleted', kind: 'strikethrough' }) as HTMLElement
    expect(node.tagName).toBe('DEL')
  })

  it('creates text node for plain text', () => {
    const node = createSegmentNode({ text: 'hello', kind: 'text' })
    expect(node.nodeType).toBe(Node.TEXT_NODE)
    expect(node.textContent).toBe('hello')
  })
})

describe('renderLineElement', () => {
  function makeLine(overrides: Partial<LiveLine>): LiveLine {
    return { raw: '', blockType: 'paragraph', segments: [], ...overrides }
  }

  it('creates a div with data-line attribute', () => {
    const el = renderLineElement(makeLine({}), 5)
    expect(el.tagName).toBe('DIV')
    expect(el.dataset.line).toBe('5')
    expect(el.classList.contains('live-line')).toBe(true)
  })

  it('adds heading class', () => {
    const el = renderLineElement(makeLine({ blockType: 'heading', blockLevel: 2 }), 0)
    expect(el.classList.contains('live-h2')).toBe(true)
  })

  it('adds blockquote class', () => {
    const el = renderLineElement(makeLine({ blockType: 'blockquote' }), 0)
    expect(el.classList.contains('live-blockquote')).toBe(true)
  })

  it('adds code fence class', () => {
    const el = renderLineElement(makeLine({ blockType: 'code-block-open' }), 0)
    expect(el.classList.contains('live-code-fence')).toBe(true)
  })

  it('renders <br> for empty segments', () => {
    const el = renderLineElement(makeLine({ segments: [] }), 0)
    expect(el.querySelector('br')).toBeTruthy()
  })

  it('renders segments as child nodes', () => {
    const segments: LiveSegment[] = [
      { text: '## ', kind: 'syntax' },
      { text: 'Hello', kind: 'text' },
    ]
    const el = renderLineElement(makeLine({ segments }), 0)
    expect(el.childNodes.length).toBe(2)
    expect((el.childNodes[0] as HTMLElement).className).toBe('syntax')
    expect(el.childNodes[1].textContent).toBe('Hello')
  })

  it('uses custom node factory when provided', () => {
    const segments: LiveSegment[] = [{ text: 'test', kind: 'text' }]
    const factory = (seg: LiveSegment) => {
      const span = document.createElement('span')
      span.className = 'custom'
      span.textContent = seg.text
      return span
    }
    const el = renderLineElement(makeLine({ segments }), 0, factory)
    expect((el.childNodes[0] as HTMLElement).className).toBe('custom')
  })
})
