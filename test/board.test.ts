import { describe, expect, it } from 'vitest'
import { moveBoardCard, parseBoard, serializeBoard } from '../src/features/board/index.js'

describe('board feature', () => {
  const source = [
    '## To do',
    '- [ ] First',
    '- [ ] Second',
    '',
    '## Done',
    '- [x] Shipped',
  ]

  it('parses and serializes Markdown columns and task cards', () => {
    const parsed = parseBoard(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.model.columns).toHaveLength(2)
    expect(parsed.model.columns[0].cards[1].text).toBe('Second')
    expect(parsed.model.columns[1].cards[0].checked).toBe(true)
    expect(serializeBoard(parsed.model)).toEqual(source)
  })

  it('moves cards between columns without losing Markdown data', () => {
    const parsed = parseBoard(source)
    if (!parsed.ok) throw new Error(parsed.errors.join(' '))
    const moved = moveBoardCard(parsed.model, 0, 0, 1, 1)

    expect(moved.columns[0].cards.map(card => card.text)).toEqual(['Second'])
    expect(moved.columns[1].cards.map(card => card.text)).toEqual(['Shipped', 'First'])
    expect(serializeBoard(moved)).toContain('- [ ] First')
  })

  it('rejects content that cannot be round-tripped safely', () => {
    const parsed = parseBoard(['- [ ] Orphan', 'plain text'])
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors).toHaveLength(3)
  })
})
