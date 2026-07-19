import { beforeEach, describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import { parseLiveInlinePlus } from '../src/parse-inline-plus'
import { createSegmentNodePlus } from '../src/render-plus'

beforeEach(() => {
  const window = new Window()
  globalThis.document = window.document as unknown as Document
})

describe('reference syntax feature', () => {
  it('preserves wikilink and embed source characters with unresolved metadata', () => {
    const source = 'Ve [[Nota#Parte|alias]] y ![[assets/cover.png]].'
    const segments = parseLiveInlinePlus(source)

    expect(segments.map((segment) => segment.text).join('')).toBe(source)
    expect(
      segments
        .filter((segment) => segment.reference)
        .map((segment) => [segment.kind, segment.reference]),
    ).toEqual([
      [
        'reference-target',
        {
          target: 'Nota#Parte',
          syntax: 'wikilink',
          embed: false,
          label: 'alias',
        },
      ],
      [
        'reference-label',
        {
          target: 'Nota#Parte',
          syntax: 'wikilink',
          embed: false,
          label: 'alias',
        },
      ],
      [
        'reference-target',
        {
          target: 'assets/cover.png',
          syntax: 'wikilink-embed',
          embed: true,
        },
      ],
    ])
  })

  it('annotates Markdown links and images without changing their text', () => {
    const source = '[Nota](docs/Nota.md) ![Cover](assets/cover.png)'
    const segments = parseLiveInlinePlus(source)

    expect(segments.map((segment) => segment.text).join('')).toBe(source)
    expect(segments.find((segment) => segment.kind === 'link-text')?.reference).toEqual({
      target: 'docs/Nota.md',
      syntax: 'markdown-link',
      embed: false,
      label: 'Nota',
    })
    expect(segments.find((segment) => segment.kind === 'image-alt')?.reference).toEqual({
      target: 'assets/cover.png',
      syntax: 'markdown-image',
      embed: true,
      label: 'Cover',
    })
  })

  it('renders generic host data without resolving paths', () => {
    const segment = parseLiveInlinePlus('[[Note|Open]]').find(
      (item) => item.kind === 'reference-label',
    )
    const node = createSegmentNodePlus(segment!) as HTMLElement

    expect(node.classList.contains('live-reference')).toBe(true)
    expect(node.dataset.referenceTarget).toBe('Note')
    expect(node.dataset.referenceSyntax).toBe('wikilink')
    expect(node.textContent).toBe('Open')
  })
})
