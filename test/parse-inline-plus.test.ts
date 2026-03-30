import { describe, it, expect } from 'vitest'
import { parseLiveInlinePlus } from '../src/parse-inline-plus'

describe('parseLiveInlinePlus', () => {
  it('delegates base formatting to parseLiveInline', () => {
    const segs = parseLiveInlinePlus('**bold**')
    expect(segs[0]).toEqual({ text: '**', kind: 'syntax' })
    expect(segs[1]).toEqual({ text: 'bold', kind: 'bold' })
    expect(segs[2]).toEqual({ text: '**', kind: 'syntax' })
  })

  it('parses autolink', () => {
    const segs = parseLiveInlinePlus('<https://example.com>')
    expect(segs[0]).toEqual({ text: '<', kind: 'syntax' })
    expect(segs[1]).toEqual({ text: 'https://example.com', kind: 'autolink' })
    expect(segs[2]).toEqual({ text: '>', kind: 'syntax' })
  })

  it('parses email autolink', () => {
    const segs = parseLiveInlinePlus('<user@example.com>')
    expect(segs[1]).toEqual({ text: 'user@example.com', kind: 'autolink' })
  })

  it('parses footnote reference', () => {
    const segs = parseLiveInlinePlus('text[^1]more')
    const ref = segs.find(s => s.kind === 'footnote-ref')
    expect(ref?.text).toBe('1')
  })

  it('parses reference link [text][ref]', () => {
    const segs = parseLiveInlinePlus('[click][ref-id]')
    expect(segs[0]).toEqual({ text: '[', kind: 'syntax' })
    expect(segs[1]).toEqual({ text: 'click', kind: 'ref-link-text' })
    expect(segs[2]).toEqual({ text: '][', kind: 'syntax' })
    expect(segs[3]).toEqual({ text: 'ref-id', kind: 'ref-link-label' })
    expect(segs[4]).toEqual({ text: ']', kind: 'syntax' })
  })

  it('parses inline math $...$', () => {
    const segs = parseLiveInlinePlus('$E=mc^2$')
    expect(segs[0]).toEqual({ text: '$', kind: 'syntax' })
    expect(segs[1]).toEqual({ text: 'E=mc^2', kind: 'math-inline' })
    expect(segs[2]).toEqual({ text: '$', kind: 'syntax' })
  })

  it('parses <kbd> tag', () => {
    const segs = parseLiveInlinePlus('<kbd>Ctrl</kbd>')
    expect(segs[0]).toEqual({ text: '<kbd>', kind: 'syntax' })
    expect(segs[1]).toEqual({ text: 'Ctrl', kind: 'keyboard' })
    expect(segs[2]).toEqual({ text: '</kbd>', kind: 'syntax' })
  })

  it('parses <mark> tag', () => {
    const segs = parseLiveInlinePlus('<mark>highlighted</mark>')
    expect(segs[1]).toEqual({ text: 'highlighted', kind: 'highlight' })
  })

  it('parses <u> tag', () => {
    const segs = parseLiveInlinePlus('<u>underlined</u>')
    expect(segs[1]).toEqual({ text: 'underlined', kind: 'underline' })
  })

  it('parses superscript ^text^', () => {
    const segs = parseLiveInlinePlus('H^2^O')
    const sup = segs.find(s => s.kind === 'superscript')
    expect(sup?.text).toBe('2')
  })

  it('parses subscript ~text~', () => {
    const segs = parseLiveInlinePlus('H~2~O')
    const sub = segs.find(s => s.kind === 'subscript')
    expect(sub?.text).toBe('2')
  })

  it('parses <br> as hard break', () => {
    const segs = parseLiveInlinePlus('line<br>break')
    const br = segs.find(s => s.kind === 'hard-break')
    expect(br?.text).toBe('<br>')
  })

  it('parses trailing double space as hard break', () => {
    const segs = parseLiveInlinePlus('text  ')
    const last = segs[segs.length - 1]
    expect(last.kind).toBe('hard-break')
    expect(last.text).toBe('  ')
  })

  it('parses image with title', () => {
    const segs = parseLiveInlinePlus('![alt](img.png "title")')
    expect(segs.find(s => s.kind === 'image-alt')?.text).toBe('alt')
    expect(segs.find(s => s.kind === 'image-url')?.text).toBe('img.png')
    expect(segs.find(s => s.kind === 'link-title')?.text).toBe('title')
  })

  it('parses image without title', () => {
    const segs = parseLiveInlinePlus('![alt](img.png)')
    expect(segs.find(s => s.kind === 'image-alt')?.text).toBe('alt')
    expect(segs.find(s => s.kind === 'image-url')?.text).toBe('img.png')
  })

  it('parses image reference ![alt][ref]', () => {
    const segs = parseLiveInlinePlus('![alt][myref]')
    expect(segs.find(s => s.kind === 'image-alt')?.text).toBe('alt')
    expect(segs.find(s => s.kind === 'ref-link-label')?.text).toBe('myref')
  })

  it('parses link with title', () => {
    const segs = parseLiveInlinePlus('[text](url "title")')
    expect(segs.find(s => s.kind === 'link-text')?.text).toBe('text')
    expect(segs.find(s => s.kind === 'link-url')?.text).toBe('url')
    expect(segs.find(s => s.kind === 'link-title')?.text).toBe('title')
  })

  it('parses <sup> and <sub> tags', () => {
    const sup = parseLiveInlinePlus('<sup>2</sup>')
    expect(sup[1]).toEqual({ text: '2', kind: 'superscript' })

    const sub = parseLiveInlinePlus('<sub>2</sub>')
    expect(sub[1]).toEqual({ text: '2', kind: 'subscript' })
  })
})
