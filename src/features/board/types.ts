export type BoardCard = {
  id: string
  checked: boolean
  text: string
}

export type BoardColumn = {
  id: string
  title: string
  cards: BoardCard[]
}

export type BoardModel = {
  version: 1
  columns: BoardColumn[]
}

export type BoardParseResult =
  | { ok: true; model: BoardModel }
  | { ok: false; errors: string[] }
