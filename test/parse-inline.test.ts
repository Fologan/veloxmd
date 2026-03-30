import { describe, it, expect } from 'vitest'
import { parseLiveInline } from '../src/parse-inline'

describe('parseLiveInline', () => {
  it('returns plain text as-is', () => {
    const segs = parseLiveInline('hello world')
    expect(segs).toEqual([{ text: 'hello world', kind: 'text' }])
  })

  it('parses bold with **', () => {
    const segs = parseLiveInline('**bold**')
    expect(segs[0]).toEqual({ text: '**', kind: 'syntax' })
    expect(segs[1]).toEqual({ text: 'bold', kind: 'bold' })
    expect(segs[2]).toEqual({ text: '**', kind: 'syntax' })
  })

  it('parses italic with *', () => {
    const segs = parseLiveInline('*italic*')
    expect(segs[0]).toEqual({ text: '*', kind: 'syntax' })
    expect(segs[1]).toEqual({ text: 'italic', kind: 'italic' })
    expect(segs[2]).toEqual({ text: '*', kind: 'syntax' })
  })

  it('parses bold italic with ***', () => {
    const segs = parseLiveInline('***both***')
    expect(segs[0]).toEqual({ text: '***', kind: 'syntax' })
    expect(segs[1]).toEqual({ text: 'both', kind: 'bold-italic' })
    expect(segs[2]).toEqual({ text: '***', kind: 'syntax' })
  })

  it('parses inline code', () => {
    const segs = parseLiveInline('use `code` here')
    expect(segs[0]).toEqual({ text: 'use ', kind: 'text' })
    expect(segs[1]).toEqual({ text: '`', kind: 'syntax' })
    expect(segs[2]).toEqual({ text: 'code', kind: 'code' })
    expect(segs[3]).toEqual({ text: '`', kind: 'syntax' })
    expect(segs[4]).toEqual({ text: ' here', kind: 'text' })
  })

  it('parses strikethrough', () => {
    const segs = parseLiveInline('~~deleted~~')
    expect(segs[0]).toEqual({ text: '~~', kind: 'syntax' })
    expect(segs[1]).toEqual({ text: 'deleted', kind: 'strikethrough' })
    expect(segs[2]).toEqual({ text: '~~', kind: 'syntax' })
  })

  it('parses links', () => {
    const segs = parseLiveInline('[text](url)')
    expect(segs[0]).toEqual({ text: '[', kind: 'syntax' })
    expect(segs[1]).toEqual({ text: 'text', kind: 'link-text' })
    expect(segs[2]).toEqual({ text: '](', kind: 'syntax' })
    expect(segs[3]).toEqual({ text: 'url', kind: 'link-url' })
    expect(segs[4]).toEqual({ text: ')', kind: 'syntax' })
  })

  it('parses images', () => {
    const segs = parseLiveInline('![alt](img.png)')
    expect(segs[0]).toEqual({ text: '![', kind: 'syntax' })
    expect(segs[1]).toEqual({ text: 'alt', kind: 'link-text' })
    expect(segs[2]).toEqual({ text: '](', kind: 'syntax' })
    expect(segs[3]).toEqual({ text: 'img.png', kind: 'link-url' })
    expect(segs[4]).toEqual({ text: ')', kind: 'syntax' })
  })

  it('handles escape sequences', () => {
    const segs = parseLiveInline('\\*not italic\\*')
    expect(segs[0]).toEqual({ text: '\\', kind: 'syntax' })
    expect(segs[1]).toEqual({ text: '*not italic', kind: 'text' })
    expect(segs[2]).toEqual({ text: '\\', kind: 'syntax' })
    expect(segs[3]).toEqual({ text: '*', kind: 'text' })
  })

  it('handles mixed formatting', () => {
    const segs = parseLiveInline('hello **bold** and *italic*')
    const kinds = segs.map(s => s.kind)
    expect(kinds).toEqual(['text', 'syntax', 'bold', 'syntax', 'text', 'syntax', 'italic', 'syntax'])
  })

  it('handles unclosed markers as plain text', () => {
    const segs = parseLiveInline('just a * alone')
    expect(segs).toEqual([{ text: 'just a * alone', kind: 'text' }])
  })
})
