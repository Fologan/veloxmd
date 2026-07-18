import type { VisualBlockMountContext, VisualBlockMountHandle } from '../visual-blocks/types.js'
import { chartX, chartY, createChartLayout, type ChartLayout } from './geometry.js'
import { parseChart } from './parse.js'
import type { ChartSeries, ChartSpec } from './types.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const COLORS = ['#5b8def', '#e66a6a', '#4db48b', '#d99b35', '#9b78e6', '#45a7bd']
const MIN_CHART_WIDTH = 320
const FALLBACK_CHART_WIDTH = 960
const MAX_X_TICKS = 7

type SvgAttributes = Record<string, number | string>

function svgElement(tag: string, attributes: SvgAttributes = {}, text = '') {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value))
  }
  if (text) element.textContent = text
  return element
}

function renderError(surface: HTMLElement, errors: string[]) {
  const message = document.createElement('div')
  message.className = 'veloxmd-chart-error veloxmd-visual-error'
  message.textContent = errors.join(' ')
  surface.appendChild(message)
}

function formatValue(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function coordinate(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0
}

function chartColor(series: ChartSeries, seriesIndex: number) {
  const candidate = series.color?.trim()
  if (!candidate || /[;{}]|url\s*\(/i.test(candidate)) return COLORS[seriesIndex % COLORS.length]
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', candidate) ? candidate : COLORS[seriesIndex % COLORS.length]
  }
  return /^#[\da-f]{3,8}$/i.test(candidate) ? candidate : COLORS[seriesIndex % COLORS.length]
}

function applySeriesColor(element: SVGElement, property: 'fill' | 'stroke', color: string) {
  element.style[property] = color
}

function appendText(
  parent: SVGElement,
  className: string,
  x: number,
  y: number,
  text: string,
  anchor: 'end' | 'middle' | 'start' = 'start',
) {
  const element = svgElement('text', {
    class: className,
    'text-anchor': anchor,
    x: coordinate(x),
    y: coordinate(y),
  }, text)
  parent.appendChild(element)
  return element
}

function renderTitle(svg: SVGSVGElement, spec: ChartSpec, width: number) {
  const title = svgElement('title', {}, spec.title || 'Chart')
  const description = svgElement(
    'desc',
    {},
    spec.series
      .map(series => {
        let min = Number.POSITIVE_INFINITY
        let max = Number.NEGATIVE_INFINITY
        for (const value of series.values) {
          min = Math.min(min, value)
          max = Math.max(max, value)
        }
        return `${series.name}: ${series.values.length} points from ${formatValue(min)} to ${formatValue(max)}`
      })
      .join('. '),
  )
  svg.append(title, description)
  if (spec.title) appendText(svg, 'veloxmd-chart-title', width / 2, 23, spec.title, 'middle')
}

function renderLegend(svg: SVGSVGElement, spec: ChartSpec, width: number) {
  const group = svgElement('g', { class: 'veloxmd-chart-legend' })
  let cursorX = 52
  const y = spec.title ? 42 : 23
  const maxX = Math.max(80, width - 24)

  for (let index = 0; index < spec.series.length; index += 1) {
    const series = spec.series[index]
    const itemWidth = Math.min(180, Math.max(70, series.name.length * 7 + 30))
    if (cursorX + itemWidth > maxX) break

    const marker = svgElement('line', {
      class: 'veloxmd-chart-legend-marker',
      x1: cursorX,
      x2: cursorX + 16,
      y1: y - 4,
      y2: y - 4,
    })
    applySeriesColor(marker, 'stroke', chartColor(series, index))
    group.append(marker)
    appendText(group, 'veloxmd-chart-legend-label', cursorX + 22, y, series.name)
    cursorX += itemWidth
  }
  svg.appendChild(group)
}

function xLabel(spec: ChartSpec, index: number) {
  return spec.labels?.[index] ?? formatValue(spec.x?.[index] ?? index)
}

function renderAxes(svg: SVGSVGElement, spec: ChartSpec, layout: ChartLayout) {
  const grid = svgElement('g', { class: 'veloxmd-chart-grid' })
  const labels = svgElement('g', { class: 'veloxmd-chart-axis-labels' })

  for (let tick = 0; tick <= 4; tick += 1) {
    const ratio = tick / 4
    const y = layout.bottom - ratio * layout.height
    const value = layout.minY + ratio * (layout.maxY - layout.minY)
    grid.appendChild(svgElement('line', {
      class: 'veloxmd-chart-grid-line',
      x1: layout.left,
      x2: layout.right,
      y1: coordinate(y),
      y2: coordinate(y),
    }))
    appendText(labels, 'veloxmd-chart-axis-label', layout.left - 8, y + 4, formatValue(value), 'end')
  }

  const pointCount = spec.series[0]?.values.length || 0
  const stride = Math.max(1, Math.ceil(pointCount / MAX_X_TICKS))
  const xIndices: number[] = []
  for (let index = 0; index < pointCount; index += stride) xIndices.push(index)
  if (pointCount > 1 && xIndices.at(-1) !== pointCount - 1) xIndices.push(pointCount - 1)
  for (const index of xIndices) {
    appendText(
      labels,
      'veloxmd-chart-axis-label',
      chartX(spec, index, layout),
      layout.bottom + 22,
      xLabel(spec, index),
      'middle',
    )
  }

  grid.appendChild(svgElement('path', {
    class: 'veloxmd-chart-axis-line',
    d: `M${coordinate(layout.left)},${coordinate(layout.top)}V${coordinate(layout.bottom)}H${coordinate(layout.right)}`,
  }))
  svg.append(grid, labels)
}

function linePath(spec: ChartSpec, series: ChartSeries, layout: ChartLayout) {
  return series.values.map((value, index) => {
    const command = index === 0 ? 'M' : 'L'
    return `${command}${coordinate(chartX(spec, index, layout))},${coordinate(chartY(value, layout))}`
  }).join('')
}

function markerPath(spec: ChartSpec, series: ChartSeries, layout: ChartLayout, radius: number) {
  const diameter = radius * 2
  return series.values.map((value, index) => {
    const x = coordinate(chartX(spec, index, layout))
    const y = coordinate(chartY(value, layout))
    return `M${coordinate(x - radius)},${y}a${radius},${radius} 0 1,0 ${diameter},0a${radius},${radius} 0 1,0 -${diameter},0`
  }).join('')
}

function renderLineSeries(
  svg: SVGSVGElement,
  spec: ChartSpec,
  series: ChartSeries,
  seriesIndex: number,
  layout: ChartLayout,
) {
  const color = chartColor(series, seriesIndex)
  const path = linePath(spec, series, layout)
  if (spec.type === 'area' && series.values.length > 0) {
    const firstX = coordinate(chartX(spec, 0, layout))
    const lastX = coordinate(chartX(spec, series.values.length - 1, layout))
    const area = svgElement('path', {
      class: 'veloxmd-chart-series-area',
      d: `${path}L${lastX},${coordinate(layout.bottom)}L${firstX},${coordinate(layout.bottom)}Z`,
    })
    applySeriesColor(area, 'fill', color)
    svg.appendChild(area)
  }

  if (spec.type !== 'scatter') {
    const line = svgElement('path', { class: 'veloxmd-chart-series-line', d: path })
    applySeriesColor(line, 'stroke', color)
    svg.appendChild(line)
  }

  const markers = svgElement('path', {
    class: 'veloxmd-chart-series-markers',
    d: markerPath(spec, series, layout, spec.type === 'scatter' ? 3 : 2.25),
  })
  applySeriesColor(markers, 'fill', color)
  svg.appendChild(markers)
}

function renderBarSeries(
  svg: SVGSVGElement,
  spec: ChartSpec,
  series: ChartSeries,
  seriesIndex: number,
  layout: ChartLayout,
) {
  const groupWidth = layout.width / Math.max(1, series.values.length)
  const barWidth = Math.max(1, Math.min(38, (groupWidth * 0.76) / spec.series.length))
  const offset = (seriesIndex - (spec.series.length - 1) / 2) * barWidth
  const baselineY = chartY(0, layout)
  const commands = series.values.map((value, index) => {
    const x = chartX(spec, index, layout) + offset - barWidth / 2
    const valueY = chartY(value, layout)
    const y = Math.min(valueY, baselineY)
    const height = Math.max(1, Math.abs(valueY - baselineY))
    return `M${coordinate(x)},${coordinate(y)}h${coordinate(barWidth)}v${coordinate(height)}h-${coordinate(barWidth)}Z`
  }).join('')
  const bars = svgElement('path', { class: 'veloxmd-chart-series-bars', d: commands })
  applySeriesColor(bars, 'fill', chartColor(series, seriesIndex))
  svg.appendChild(bars)
}

function renderSeries(svg: SVGSVGElement, spec: ChartSpec, layout: ChartLayout) {
  const group = svgElement('g', { class: 'veloxmd-chart-series' }) as SVGGElement
  for (let index = 0; index < spec.series.length; index += 1) {
    if (spec.type === 'bar') renderBarSeries(group as unknown as SVGSVGElement, spec, spec.series[index], index, layout)
    else renderLineSeries(group as unknown as SVGSVGElement, spec, spec.series[index], index, layout)
  }
  svg.appendChild(group)
}

function createStaticChart(spec: ChartSpec, width: number) {
  const svg = svgElement('svg', {
    'aria-label': spec.title || 'Chart',
    class: 'veloxmd-chart-svg',
    height: spec.height,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    viewBox: `0 0 ${width} ${spec.height}`,
    width: width,
  }) as SVGSVGElement
  svg.dataset.chartKind = spec.type
  svg.dataset.chartPoints = String(spec.series.reduce((total, series) => total + series.values.length, 0))
  svg.dataset.chartStatic = 'true'

  const layout = createChartLayout(spec, width, spec.height)
  renderTitle(svg, spec, width)
  renderLegend(svg, spec, width)
  renderAxes(svg, spec, layout)
  renderSeries(svg, spec, layout)
  return svg
}

export function mountChart(context: VisualBlockMountContext): VisualBlockMountHandle | void {
  const parsed = parseChart(context.source.bodyLines)
  if (!parsed.ok) {
    renderError(context.surface, parsed.errors)
    return
  }

  const chartHost = document.createElement('div')
  chartHost.className = 'veloxmd-chart-static'
  chartHost.dataset.chartState = 'static'
  chartHost.style.height = `${parsed.spec.height}px`
  context.surface.appendChild(chartHost)

  const measuredWidth = Math.round(chartHost.getBoundingClientRect().width)
  const width = Math.max(MIN_CHART_WIDTH, measuredWidth || FALLBACK_CHART_WIDTH)
  const svg = createStaticChart(parsed.spec, width)
  chartHost.appendChild(svg)

  return {
    destroy() {
      chartHost.remove()
    },
  }
}
