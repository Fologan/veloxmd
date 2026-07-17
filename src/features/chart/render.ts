import type uPlotType from 'uplot'
import type { AlignedData, Options, Series } from 'uplot'
import type { VisualBlockMountContext, VisualBlockMountHandle } from '../visual-blocks/types.js'
import { parseChart, serializeChart, updateChartValue } from './parse.js'
import type { ChartSpec } from './types.js'

const COLORS = ['#5b8def', '#e66a6a', '#4db48b', '#d99b35', '#9b78e6', '#45a7bd']

type DragState = {
  moved: boolean
  pointIndex: number
  pointerId: number
  seriesIndex: number
}

function alpha(color: string, fallback: string) {
  const hex = /^#([\da-f]{6})$/i.exec(color)
  if (!hex) return fallback
  const value = Number.parseInt(hex[1], 16)
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, 0.18)`
}

function chartData(spec: ChartSpec): AlignedData {
  const x = spec.x ? [...spec.x] : spec.labels!.map((_, index) => index)
  return [x, ...spec.series.map(series => [...series.values])] as AlignedData
}

function chartSeries(uPlot: typeof uPlotType, spec: ChartSpec): Series[] {
  return [
    {},
    ...spec.series.map((series, index) => {
      const color = series.color || COLORS[index % COLORS.length]
      const base: Series = {
        label: series.name,
        stroke: color,
        width: spec.type === 'scatter' ? 0 : 2,
        points: { show: true, size: spec.type === 'scatter' ? 8 : 6 },
      }
      if (spec.type === 'area') base.fill = alpha(color, 'rgba(91, 141, 239, 0.18)')
      if (spec.type === 'bar' && uPlot.paths.bars) {
        base.paths = uPlot.paths.bars({ align: 0, size: [0.72, 72, 3], radius: 0.08 })
        base.points = { show: false }
        base.width = 0
      }
      return base
    }),
  ]
}

function chartOptions(uPlot: typeof uPlotType, spec: ChartSpec, width: number): Options {
  return {
    width,
    height: spec.height,
    title: spec.title,
    pxAlign: true,
    cursor: {
      drag: { x: true, y: false, setScale: true },
      points: { size: 7 },
    },
    legend: { show: true, live: true },
    axes: [
      spec.labels
        ? {
            values: (_self, ticks) => ticks.map(value => spec.labels?.[Math.round(value)] || ''),
          }
        : {},
      {},
    ],
    series: chartSeries(uPlot, spec),
  }
}

function renderError(surface: HTMLElement, errors: string[]) {
  const message = document.createElement('p')
  message.className = 'veloxmd-chart-error veloxmd-visual-error'
  message.textContent = errors.join(' ')
  surface.appendChild(message)
}

function roundedValue(value: number) {
  return Number(value.toFixed(3))
}

export async function mountChart(context: VisualBlockMountContext): Promise<VisualBlockMountHandle | void> {
  const parsed = parseChart(context.source.bodyLines)
  if (!parsed.ok) {
    renderError(context.surface, parsed.errors)
    return
  }

  const loading = document.createElement('p')
  loading.className = 'veloxmd-chart-loading'
  loading.textContent = 'Rendering chart…'
  context.surface.appendChild(loading)

  const { default: uPlot } = await import('uplot')
  if (!context.surface.isConnected) return
  loading.remove()

  let spec = parsed.spec
  const chartHost = document.createElement('div')
  chartHost.className = 'veloxmd-chart-canvas'
  chartHost.style.height = `${spec.height}px`
  context.surface.appendChild(chartHost)

  const initialWidth = Math.max(280, Math.floor(context.surface.getBoundingClientRect().width || 640))
  const chart = new uPlot(chartOptions(uPlot, spec, initialWidth), chartData(spec), chartHost)
  let drag: DragState | null = null
  let updateFrame = 0
  let metadataFrame = 0
  let pendingValue: number | null = null

  const syncEditablePointMetadata = () => {
    metadataFrame = 0
    const pointIndex = Math.floor((spec.series[0]?.values.length || 1) / 2)
    const xValues = spec.x || spec.labels!.map((_, index) => index)
    const value = spec.series[0]?.values[pointIndex]
    if (value === undefined) return
    chart.over.dataset.editablePointSeries = '0'
    chart.over.dataset.editablePointIndex = String(pointIndex)
    chart.over.dataset.editablePointX = String(chart.valToPos(xValues[pointIndex], 'x'))
    chart.over.dataset.editablePointY = String(chart.valToPos(value, 'y'))
  }

  const queueEditablePointMetadata = () => {
    if (!metadataFrame) metadataFrame = requestAnimationFrame(syncEditablePointMetadata)
  }
  queueEditablePointMetadata()

  const findNearestPoint = (event: PointerEvent) => {
    const rect = chart.over.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    let nearest: { distance: number; pointIndex: number; seriesIndex: number } | null = null
    const xValues = spec.x || spec.labels!.map((_, index) => index)

    for (let seriesIndex = 0; seriesIndex < spec.series.length; seriesIndex += 1) {
      const series = spec.series[seriesIndex]
      for (let pointIndex = 0; pointIndex < series.values.length; pointIndex += 1) {
        const value = series.values[pointIndex]
        const pointX = chart.valToPos(xValues[pointIndex], 'x')
        const pointY = chart.valToPos(value, 'y')
        const distance = Math.hypot(pointX - x, pointY - y)
        if (!nearest || distance < nearest.distance) nearest = { distance, pointIndex, seriesIndex }
      }
    }
    return nearest && nearest.distance <= 18 ? nearest : null
  }

  const applyPendingValue = () => {
    updateFrame = 0
    if (!drag || pendingValue === null) return
    spec = updateChartValue(spec, drag.seriesIndex, drag.pointIndex, pendingValue)
    chart.setData(chartData(spec), false)
    queueEditablePointMetadata()
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!spec.editable || event.button !== 0) return
    const nearest = findNearestPoint(event)
    if (!nearest) return
    event.preventDefault()
    event.stopPropagation()
    chart.over.setPointerCapture?.(event.pointerId)
    drag = {
      moved: false,
      pointIndex: nearest.pointIndex,
      pointerId: event.pointerId,
      seriesIndex: nearest.seriesIndex,
    }
    chart.root.classList.add('is-editing-point')
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    const rect = chart.over.getBoundingClientRect()
    pendingValue = roundedValue(chart.posToVal(event.clientY - rect.top, 'y'))
    drag.moved = true
    if (!updateFrame) updateFrame = requestAnimationFrame(applyPendingValue)
  }

  const finishDrag = (event: PointerEvent, shouldCommit: boolean) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    if (updateFrame) {
      cancelAnimationFrame(updateFrame)
      applyPendingValue()
    }
    const completed = drag
    drag = null
    pendingValue = null
    chart.root.classList.remove('is-editing-point')
    chart.over.releasePointerCapture?.(event.pointerId)
    if (completed.moved && shouldCommit) context.commit(serializeChart(spec))
  }

  const onPointerUp = (event: PointerEvent) => finishDrag(event, true)
  const onPointerCancel = (event: PointerEvent) => finishDrag(event, false)
  chart.over.addEventListener('pointerdown', onPointerDown, true)
  chart.over.addEventListener('pointermove', onPointerMove, true)
  chart.over.addEventListener('pointerup', onPointerUp, true)
  chart.over.addEventListener('pointercancel', onPointerCancel, true)

  const observer = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(entries => {
        const width = Math.floor(entries[0]?.contentRect.width || 0)
        if (width > 0 && width !== chart.width) {
          chart.setSize({ width, height: spec.height })
          queueEditablePointMetadata()
        }
      })
  observer?.observe(context.surface)

  return {
    destroy() {
      if (updateFrame) cancelAnimationFrame(updateFrame)
      if (metadataFrame) cancelAnimationFrame(metadataFrame)
      observer?.disconnect()
      chart.over.removeEventListener('pointerdown', onPointerDown, true)
      chart.over.removeEventListener('pointermove', onPointerMove, true)
      chart.over.removeEventListener('pointerup', onPointerUp, true)
      chart.over.removeEventListener('pointercancel', onPointerCancel, true)
      chart.destroy()
    },
  }
}
