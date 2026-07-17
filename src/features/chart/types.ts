export type ChartKind = 'line' | 'area' | 'bar' | 'scatter'

export type ChartSeries = {
  name: string
  values: number[]
  color?: string
}

export type ChartSpec = {
  version: 1
  type: ChartKind
  title?: string
  labels?: string[]
  x?: number[]
  series: ChartSeries[]
  editable: boolean
  height: number
}

export type ChartParseResult =
  | { ok: true; spec: ChartSpec }
  | { ok: false; errors: string[] }
