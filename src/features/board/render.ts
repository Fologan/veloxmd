import type { VisualBlockMountContext, VisualBlockMountHandle } from '../visual-blocks/types.js'
import { parseBoard, serializeBoard } from './parse.js'
import type { BoardCard, BoardModel } from './types.js'

type DragState = {
  active: boolean
  card: HTMLElement
  originNext: ChildNode | null
  originParent: HTMLElement
  pointerId: number
  startX: number
  startY: number
}

function renderError(surface: HTMLElement, errors: string[]) {
  const message = document.createElement('div')
  message.className = 'veloxmd-board-error veloxmd-visual-error'
  message.textContent = errors.join(' ')
  surface.appendChild(message)
}

function boardFromDom(root: HTMLElement, cards: Map<string, BoardCard>, template: BoardModel): BoardModel {
  const columns = Array.from(root.querySelectorAll<HTMLElement>('.veloxmd-board-column')).map((column, index) => {
    const templateColumn = template.columns[index]
    const nextCards = Array.from(column.querySelectorAll<HTMLElement>('.veloxmd-board-card')).map(element => {
      const original = cards.get(element.dataset.cardId || '')
      return {
        id: original?.id || element.dataset.cardId || `card-${index}`,
        text: original?.text || element.dataset.cardText || '',
        checked: element.dataset.checked === 'true',
      }
    })
    return { ...templateColumn, cards: nextCards }
  })
  return { ...template, columns }
}

function renderBoardCard(card: BoardCard) {
  const element = document.createElement('article')
  element.className = 'veloxmd-board-card'
  element.dataset.cardId = card.id
  element.dataset.cardText = card.text
  element.dataset.checked = String(card.checked)
  element.setAttribute('aria-label', card.text || 'Empty card')

  const check = document.createElement('button')
  check.type = 'button'
  check.className = 'veloxmd-board-check'
  check.dataset.boardAction = 'toggle'
  check.setAttribute('aria-label', card.checked ? 'Mark pending' : 'Mark complete')
  check.textContent = card.checked ? '✓' : ''

  const text = document.createElement('span')
  text.className = 'veloxmd-board-card-text'
  text.textContent = card.text
  element.classList.toggle('is-checked', card.checked)
  element.append(check, text)
  return element
}

export function mountBoard(context: VisualBlockMountContext): VisualBlockMountHandle | void {
  const parsed = parseBoard(context.source.bodyLines)
  if (!parsed.ok) {
    renderError(context.surface, parsed.errors)
    return
  }

  const model = parsed.model
  const cardMap = new Map(model.columns.flatMap(column => column.cards.map(card => [card.id, card] as const)))
  const board = document.createElement('div')
  board.className = 'veloxmd-board'
  board.dataset.boardColumns = String(model.columns.length)

  for (const column of model.columns) {
    const columnElement = document.createElement('section')
    columnElement.className = 'veloxmd-board-column'
    columnElement.dataset.columnId = column.id

    const heading = document.createElement('header')
    heading.className = 'veloxmd-board-column-header'
    const title = document.createElement('h3')
    title.textContent = column.title
    const count = document.createElement('span')
    count.className = 'veloxmd-board-count'
    count.textContent = String(column.cards.length)
    heading.append(title, count)

    const list = document.createElement('div')
    list.className = 'veloxmd-board-card-list'
    list.dataset.columnId = column.id
    for (const card of column.cards) list.appendChild(renderBoardCard(card))
    columnElement.append(heading, list)
    board.appendChild(columnElement)
  }
  context.surface.appendChild(board)

  let drag: DragState | null = null
  let pointerFrame = 0
  let latestPointer: PointerEvent | null = null

  const commitDom = () => context.commit(serializeBoard(boardFromDom(board, cardMap, model)))

  const onClick = (event: MouseEvent) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-board-action="toggle"]')
    if (!button) return
    const card = button.closest<HTMLElement>('.veloxmd-board-card')
    if (!card) return
    const checked = card.dataset.checked !== 'true'
    card.dataset.checked = String(checked)
    card.classList.toggle('is-checked', checked)
    button.textContent = checked ? '✓' : ''
    button.setAttribute('aria-label', checked ? 'Mark pending' : 'Mark complete')
    commitDom()
  }

  const applyPointerMove = () => {
    pointerFrame = 0
    const event = latestPointer
    if (!event || !drag) return

    if (!drag.active) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
      if (distance < 5) return
      drag.active = true
      drag.card.classList.add('is-dragging')
      drag.card.setAttribute('aria-grabbed', 'true')
    }

    const rect = board.getBoundingClientRect()
    if (event.clientX < rect.left + 48) board.scrollLeft -= 18
    else if (event.clientX > rect.right - 48) board.scrollLeft += 18

    const hit = board.ownerDocument.elementFromPoint(event.clientX, event.clientY) as Element | null
    const targetCard = hit?.closest<HTMLElement>('.veloxmd-board-card')
    const targetList = hit?.closest<HTMLElement>('.veloxmd-board-card-list')
      || hit?.closest<HTMLElement>('.veloxmd-board-column')?.querySelector<HTMLElement>('.veloxmd-board-card-list')
    if (!targetList || targetCard === drag.card) return

    if (targetCard) {
      const targetRect = targetCard.getBoundingClientRect()
      const before = event.clientY < targetRect.top + targetRect.height / 2
      targetList.insertBefore(drag.card, before ? targetCard : targetCard.nextSibling)
    } else {
      targetList.appendChild(drag.card)
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target as Element | null)?.closest('button, a')) return
    const card = (event.target as Element | null)?.closest<HTMLElement>('.veloxmd-board-card')
    if (!card || !card.parentElement) return
    drag = {
      active: false,
      card,
      originNext: card.nextSibling,
      originParent: card.parentElement,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
    board.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    latestPointer = event
    if (drag.active) event.preventDefault()
    if (!pointerFrame) pointerFrame = requestAnimationFrame(applyPointerMove)
  }

  const finishDrag = (event: PointerEvent, commit: boolean) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    if (pointerFrame) cancelAnimationFrame(pointerFrame)
    pointerFrame = 0
    const completed = drag
    drag = null
    completed.card.classList.remove('is-dragging')
    completed.card.removeAttribute('aria-grabbed')
    board.releasePointerCapture?.(event.pointerId)

    if (completed.active && commit) {
      commitDom()
    } else if (completed.active) {
      completed.originParent.insertBefore(completed.card, completed.originNext)
    }
  }

  const onPointerUp = (event: PointerEvent) => finishDrag(event, true)
  const onPointerCancel = (event: PointerEvent) => finishDrag(event, false)

  board.addEventListener('click', onClick)
  board.addEventListener('pointerdown', onPointerDown)
  board.addEventListener('pointermove', onPointerMove)
  board.addEventListener('pointerup', onPointerUp)
  board.addEventListener('pointercancel', onPointerCancel)

  return {
    destroy() {
      if (pointerFrame) cancelAnimationFrame(pointerFrame)
      board.removeEventListener('click', onClick)
      board.removeEventListener('pointerdown', onPointerDown)
      board.removeEventListener('pointermove', onPointerMove)
      board.removeEventListener('pointerup', onPointerUp)
      board.removeEventListener('pointercancel', onPointerCancel)
    },
  }
}
