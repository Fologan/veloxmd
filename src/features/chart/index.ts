import type { VisualBlockFeature } from '../visual-blocks/types.js'
import { mountChart } from './render.js'

export { mountChart } from './render.js'
export { parseChart, serializeChart, updateChartValue } from './parse.js'
export type { ChartKind, ChartParseResult, ChartSeries, ChartSpec } from './types.js'

export const chartFeature: VisualBlockFeature = {
  id: 'chart',
  minHeight: 280,
  mount: mountChart,
}
