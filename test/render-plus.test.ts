import { describe, expect, it } from 'vitest'
import { createSegmentNodePlus } from '../src/render-plus'

describe('createSegmentNodePlus', () => {
  it('renders citation markers as compact citation badges', () => {
    const raw = '\uE200cite\uE202turn26view0\uE202turn27view0\uE201'
    const node = createSegmentNodePlus({ text: raw, kind: 'citation' })

    expect(node).toBeInstanceOf(HTMLElement)

    const el = node as HTMLElement
    expect(el.tagName).toBe('SUP')
    expect(el.className).toBe('live-citation')
    expect(el.textContent).toBe('citas 2')
    expect(el.title).toBe('turn26view0, turn27view0')
    expect(el.dataset.raw).toBe(raw)
    expect(el.textContent).not.toMatch(/[\uE200-\uE202]/)
  })

  it('renders citation markers as raw source capsules in source mode', () => {
    const raw = '\uE200cite\uE202turn26view0\uE202turn27view0\uE201'
    const node = createSegmentNodePlus(
      { text: raw, kind: 'citation' },
      { citationMode: 'raw' },
    )

    expect(node).toBeInstanceOf(HTMLElement)

    const el = node as HTMLElement
    expect(el.tagName).toBe('SPAN')
    expect(el.className).toBe('live-citation-source')
    expect(el.textContent).toBe(raw)
    expect(el.title).toBe('turn26view0, turn27view0')
  })
})
