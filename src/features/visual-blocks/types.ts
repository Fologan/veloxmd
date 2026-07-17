export type VisualBlockMode = 'static' | 'hybrid'

export type VisualBlockSource = {
  id: string
  startLine: number
  endLine: number
  openLine: string
  bodyLines: string[]
  closeLine: string
  info: string
}

export type VisualBlockMountHandle = {
  destroy(): void
}

export type VisualBlockMountContext = {
  surface: HTMLElement
  source: VisualBlockSource
  mode: VisualBlockMode
  commit(bodyLines: string[]): void
}

export type VisualBlockFeature = {
  id: string
  minHeight: number
  mount(
    context: VisualBlockMountContext,
  ): VisualBlockMountHandle | void | Promise<VisualBlockMountHandle | void>
}

export type VisualBlockCommit = (
  startLine: number,
  endLine: number,
  replacement: string[],
) => void
