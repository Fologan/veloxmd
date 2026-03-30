import { describe, it, expect } from 'vitest'
import { getFlatOffset, setFlatOffset } from '../src/cursor'

describe('getFlatOffset', () => {
  it('returns offset within a single text node', () => {
    const div = document.createElement('div')
    div.textContent = 'hello world'
    const textNode = div.firstChild!
    expect(getFlatOffset(div, textNode, 5)).toBe(5)
  })

  it('accounts for preceding text nodes', () => {
    const div = document.createElement('div')
    const span1 = document.createElement('span')
    span1.textContent = 'abc'
    const span2 = document.createElement('span')
    span2.textContent = 'def'
    div.appendChild(span1)
    div.appendChild(span2)

    const targetNode = span2.firstChild!
    expect(getFlatOffset(div, targetNode, 2)).toBe(5) // 3 + 2
  })

  it('handles element target with child offset', () => {
    const div = document.createElement('div')
    const span = document.createElement('span')
    span.textContent = 'abc'
    div.appendChild(span)
    // Target is the div itself, offset is 1 (after the span)
    expect(getFlatOffset(div, div, 1)).toBe(3)
  })
})

describe('setFlatOffset', () => {
  it('finds position in a single text node', () => {
    const div = document.createElement('div')
    div.textContent = 'hello world'
    const result = setFlatOffset(div, 5)
    expect(result).not.toBeNull()
    expect(result!.node).toBe(div.firstChild)
    expect(result!.offset).toBe(5)
  })

  it('finds position across multiple nodes', () => {
    const div = document.createElement('div')
    const span1 = document.createElement('span')
    span1.textContent = 'abc'
    const span2 = document.createElement('span')
    span2.textContent = 'def'
    div.appendChild(span1)
    div.appendChild(span2)

    const result = setFlatOffset(div, 4) // offset 4 = 'd' in span2
    expect(result).not.toBeNull()
    expect(result!.node).toBe(span2.firstChild)
    expect(result!.offset).toBe(1)
  })

  it('returns end of container for exact-length offset', () => {
    const div = document.createElement('div')
    div.textContent = 'abc'
    const result = setFlatOffset(div, 3)
    expect(result).not.toBeNull()
    expect(result!.offset).toBe(3)
  })

  it('returns null for offset beyond content', () => {
    const div = document.createElement('div')
    div.textContent = 'abc'
    const result = setFlatOffset(div, 10)
    expect(result).toBeNull()
  })

  it('handles empty container at offset 0', () => {
    const div = document.createElement('div')
    const result = setFlatOffset(div, 0)
    expect(result).not.toBeNull()
    expect(result!.node).toBe(div)
    expect(result!.offset).toBe(0)
  })
})
