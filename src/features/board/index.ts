import type { VisualBlockFeature } from '../visual-blocks/types.js'
import { mountBoard } from './render.js'

export { mountBoard } from './render.js'
export { moveBoardCard, parseBoard, serializeBoard } from './parse.js'
export type { BoardCard, BoardColumn, BoardModel, BoardParseResult } from './types.js'

export const boardFeature: VisualBlockFeature = {
  id: 'board',
  minHeight: 260,
  mount: mountBoard,
}
