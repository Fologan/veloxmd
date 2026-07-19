import type { BoardCard, BoardColumn, BoardModel, BoardParseResult } from './types.js'

const COLUMN = /^##\s+(.+?)\s*$/
const CARD = /^\s*[-*+]\s+\[([ xX])\]\s*(.*?)\s*$/

export function parseBoard(bodyLines: string[]): BoardParseResult {
  const columns: BoardColumn[] = []
  const errors: string[] = []
  let current: BoardColumn | null = null

  for (let index = 0; index < bodyLines.length; index += 1) {
    const raw = bodyLines[index]
    if (raw.trim() === '') continue

    const column = raw.match(COLUMN)
    if (column) {
      current = {
        id: `column-${columns.length}`,
        title: column[1],
        cards: [],
      }
      columns.push(current)
      continue
    }

    const card = raw.match(CARD)
    if (card && current) {
      const nextCard: BoardCard = {
        id: `card-${columns.length - 1}-${current.cards.length}`,
        checked: card[1].toLowerCase() === 'x',
        text: card[2],
      }
      current.cards.push(nextCard)
      continue
    }

    if (card) {
      errors.push(`Line ${index + 1}: a card must belong to a ## column.`)
    } else {
      errors.push(`Line ${index + 1}: expected a ## column or a Markdown task.`)
    }
  }

  if (columns.length === 0) errors.push('Board requires at least one ## column.')
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, model: { version: 1, columns } }
}

export function serializeBoard(model: BoardModel): string[] {
  const lines: string[] = []
  model.columns.forEach((column, columnIndex) => {
    if (columnIndex > 0) lines.push('')
    lines.push(`## ${column.title}`)
    for (const card of column.cards) {
      lines.push(`- [${card.checked ? 'x' : ' '}] ${card.text}`)
    }
  })
  return lines
}

export function moveBoardCard(
  model: BoardModel,
  fromColumn: number,
  fromCard: number,
  toColumn: number,
  toCard: number,
): BoardModel {
  const columns = model.columns.map(column => ({
    ...column,
    cards: column.cards.map(card => ({ ...card })),
  }))
  const source = columns[fromColumn]
  const target = columns[toColumn]
  if (!source || !target || !source.cards[fromCard]) return { ...model, columns }

  const [card] = source.cards.splice(fromCard, 1)
  const adjustedTarget = fromColumn === toColumn && fromCard < toCard ? toCard - 1 : toCard
  target.cards.splice(Math.max(0, Math.min(adjustedTarget, target.cards.length)), 0, card)
  return { ...model, columns }
}
