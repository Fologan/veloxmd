import type { ChartSpec } from './types.js'

export type ChartLayout = {
  bottom: number
  height: number
  left: number
  maxX: number
  maxY: number
  minX: number
  minY: number
  right: number
  top: number
  width: number
}

function extent(values: number[]) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return { min, max }
}

export function createChartLayout(spec: ChartSpec, width: number, height: number): ChartLayout {
  const xValues = spec.x || spec.labels!.map((_, index) => index)
  const xExtent = extent(xValues)
  const values = spec.series.flatMap(series => series.values)
  const yExtent = extent(values)

  let minX = xExtent.min
  let maxX = xExtent.max
  if (minX === maxX) {
    minX -= 0.5
    maxX += 0.5
  }

  let minY = yExtent.min
  let maxY = yExtent.max
  if (spec.type === 'bar') {
    minY = Math.min(0, minY)
    maxY = Math.max(0, maxY)
  }
  const ySpan = maxY - minY
  const yPadding = ySpan > 0 ? ySpan * 0.08 : Math.max(1, Math.abs(maxY) * 0.08)
  if (spec.type === 'bar') {
    if (minY < 0) minY -= yPadding
    if (maxY > 0) maxY += yPadding
  } else {
    minY -= yPadding
    maxY += yPadding
  }
  if (minY === maxY) {
    minY -= 1
    maxY += 1
  }

  const left = 52
  const right = Math.max(left + 1, width - 18)
  const top = spec.title ? 58 : 40
  const bottom = Math.max(top + 1, height - 50)
  return {
    bottom,
    height: bottom - top,
    left,
    maxX,
    maxY,
    minX,
    minY,
    right,
    top,
    width: right - left,
  }
}

export function chartX(spec: ChartSpec, pointIndex: number, layout: ChartLayout) {
  const value = spec.x?.[pointIndex] ?? pointIndex
  return layout.left + ((value - layout.minX) / (layout.maxX - layout.minX)) * layout.width
}

export function chartY(value: number, layout: ChartLayout) {
  return layout.bottom - ((value - layout.minY) / (layout.maxY - layout.minY)) * layout.height
}

export function chartValueAtY(y: number, layout: ChartLayout) {
  const ratio = Math.max(0, Math.min(1, (layout.bottom - y) / layout.height))
  return layout.minY + ratio * (layout.maxY - layout.minY)
}
