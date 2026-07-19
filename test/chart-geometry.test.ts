import { describe, expect, it } from 'vitest'
import {
  chartValueAtY,
  chartX,
  chartY,
  createChartLayout,
} from '../src/features/chart/geometry.js'
import type { ChartSpec } from '../src/features/chart/types.js'

function spec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    version: 1,
    type: 'line',
    labels: ['A', 'B', 'C'],
    series: [{ name: 'Values', values: [10, 20, 15] }],
    editable: true,
    height: 280,
    ...overrides,
  }
}

describe('chart geometry', () => {
  it('projects labels and values into a bounded plotting rectangle', () => {
    const chart = spec()
    const layout = createChartLayout(chart, 640, chart.height)
    expect(chartX(chart, 0, layout)).toBe(layout.left)
    expect(chartX(chart, 2, layout)).toBe(layout.right)
    expect(chartY(20, layout)).toBeGreaterThanOrEqual(layout.top)
    expect(chartY(10, layout)).toBeLessThanOrEqual(layout.bottom)
  })

  it('round-trips a dragged y coordinate to its data value', () => {
    const chart = spec()
    const layout = createChartLayout(chart, 640, chart.height)
    const y = chartY(16.25, layout)
    expect(chartValueAtY(y, layout)).toBeCloseTo(16.25, 8)
  })

  it('keeps zero in range for bar charts and supports a single x value', () => {
    const chart = spec({
      type: 'bar',
      labels: ['Only'],
      series: [{ name: 'Negative', values: [-4] }],
    })
    const layout = createChartLayout(chart, 320, chart.height)
    expect(layout.maxY).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(chartX(chart, 0, layout))).toBe(true)
  })
})
