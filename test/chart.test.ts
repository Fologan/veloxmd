import { describe, expect, it } from 'vitest'
import { parseChart, serializeChart, updateChartValue } from '../src/features/chart/index.js'

describe('chart feature', () => {
  const source = JSON.stringify({
    version: 1,
    type: 'line',
    labels: ['Jan', 'Feb', 'Mar'],
    series: [{ name: 'Revenue', values: [10, 20, 15] }],
    editable: true,
    height: 260,
  }, null, 2).split('\n')

  it('validates a strict data-only chart specification', () => {
    const parsed = parseChart(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.spec.type).toBe('line')
    expect(parsed.spec.series[0].values).toEqual([10, 20, 15])
    expect(serializeChart(parsed.spec)).toEqual(source)
  })

  it('updates a point immutably for one drag commit', () => {
    const parsed = parseChart(source)
    if (!parsed.ok) throw new Error(parsed.errors.join(' '))
    const updated = updateChartValue(parsed.spec, 0, 1, 42.125)
    expect(updated.series[0].values).toEqual([10, 42.125, 15])
    expect(parsed.spec.series[0].values).toEqual([10, 20, 15])
  })

  it('rejects executable or structurally unsafe input', () => {
    expect(parseChart(['{ type: () => alert(1) }']).ok).toBe(false)
    expect(parseChart([JSON.stringify({
      type: 'line',
      labels: ['A'],
      series: [{ name: 'Bad', values: [Number.NaN] }],
    })]).ok).toBe(false)
    expect(parseChart([JSON.stringify({
      version: 1,
      type: 'line',
      labels: ['A'],
      series: [{ name: 'Unsafe extension', values: [1], formatter: 'window.alert(1)' }],
    })]).ok).toBe(false)
    expect(parseChart([JSON.stringify({
      version: 2,
      type: 'line',
      labels: ['A'],
      series: [{ name: 'Future schema', values: [1] }],
    })]).ok).toBe(false)
  })
})
