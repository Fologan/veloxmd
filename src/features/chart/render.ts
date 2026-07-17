import type { VisualBlockMountContext, VisualBlockMountHandle } from '../visual-blocks/types.js'
import {
  chartValueAtY,
  chartX,
  chartY,
  createChartLayout,
  type ChartLayout,
} from './geometry.js'
import { parseChart, serializeChart, updateChartValue } from './parse.js'
import type { ChartSeries, ChartSpec } from './types.js'

const COLORS = ['#5b8def', '#e66a6a', '#4db48b', '#d99b35', '#9b78e6', '#45a7bd']
const VIEWPORT_MARGIN_PX = 1_600
const RENDER_PIXEL_RATIO = 0.5
const SCROLL_IDLE_MS = 90

type DragState = {
  moved: boolean
  originalValue: number
  pointIndex: number
  pointerId: number
  seriesIndex: number
}

type Theme = {
  accent: string
  border: string
  font: string
  muted: string
  text: string
}

type ActiveChart = {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  cssHeight: number
  cssWidth: number
  layout: ChartLayout
  resizeObserver: ResizeObserver | null
  theme: Theme
}

type ScrollAwareChart = {
  activate(): void
  deactivate(): void
  element: HTMLElement
}

type ScrollCoordinator = {
  charts: Set<ScrollAwareChart>
  lastScrollTop: number
  onResize: () => void
  onScroll: () => void
  scheduleVisibility(): void
  settleFrame: number
  stableSince: number
  scrolling: boolean
  visibilityFrame: number
}

const scrollCoordinators = new WeakMap<EventTarget, ScrollCoordinator>()

function registerScrollAwareChart(
  scrollTarget: HTMLElement | Window,
  element: HTMLElement,
  activate: () => void,
  deactivate: () => void,
) {
  let coordinator = scrollCoordinators.get(scrollTarget)
  if (!coordinator) {
    const charts = new Set<ScrollAwareChart>()
    const refreshVisibility = () => {
      const current = scrollCoordinators.get(scrollTarget)
      if (!current) return
      current.visibilityFrame = 0
      const viewport = scrollTarget instanceof HTMLElement
        ? scrollTarget.getBoundingClientRect()
        : { bottom: window.innerHeight, top: 0 }
      for (const chart of current.charts) {
        const rect = chart.element.getBoundingClientRect()
        if (rect.bottom >= viewport.top - VIEWPORT_MARGIN_PX
          && rect.top <= viewport.bottom + VIEWPORT_MARGIN_PX) {
          chart.activate()
        } else {
          chart.deactivate()
        }
      }
    }
    const scheduleVisibility = () => {
      const current = scrollCoordinators.get(scrollTarget)
      if (!current || current.scrolling || current.visibilityFrame) return
      current.visibilityFrame = requestAnimationFrame(refreshVisibility)
    }
    const readScrollTop = () => scrollTarget instanceof HTMLElement
      ? scrollTarget.scrollTop
      : window.scrollY
    const checkScrollSettled = (now: number) => {
      const current = scrollCoordinators.get(scrollTarget)
      if (!current || !current.scrolling) return
      const scrollTop = readScrollTop()
      if (scrollTop !== current.lastScrollTop) {
        current.lastScrollTop = scrollTop
        current.stableSince = now
      }
      if (now - current.stableSince < SCROLL_IDLE_MS) {
        current.settleFrame = requestAnimationFrame(checkScrollSettled)
        return
      }
      current.settleFrame = 0
      current.scrolling = false
      refreshVisibility()
    }
    coordinator = {
      charts,
      lastScrollTop: readScrollTop(),
      onResize: scheduleVisibility,
      settleFrame: 0,
      stableSince: 0,
      scrolling: false,
      scheduleVisibility,
      visibilityFrame: 0,
      onScroll: () => {
        const current = scrollCoordinators.get(scrollTarget)
        if (!current) return
        if (current.scrolling) return
        current.scrolling = true
        current.lastScrollTop = readScrollTop()
        current.stableSince = performance.now()
        if (current.visibilityFrame) cancelAnimationFrame(current.visibilityFrame)
        current.visibilityFrame = 0
        current.settleFrame = requestAnimationFrame(checkScrollSettled)
      },
    }
    scrollCoordinators.set(scrollTarget, coordinator)
    scrollTarget.addEventListener('scroll', coordinator.onScroll, { passive: true })
    window.addEventListener('resize', coordinator.onResize, { passive: true })
  }

  const registration: ScrollAwareChart = { activate, deactivate, element }
  coordinator.charts.add(registration)
  coordinator.scheduleVisibility()

  return {
    destroy() {
      coordinator!.charts.delete(registration)
      if (coordinator!.charts.size > 0) return
      if (coordinator!.settleFrame) cancelAnimationFrame(coordinator!.settleFrame)
      if (coordinator!.visibilityFrame) cancelAnimationFrame(coordinator!.visibilityFrame)
      scrollTarget.removeEventListener('scroll', coordinator!.onScroll)
      window.removeEventListener('resize', coordinator!.onResize)
      scrollCoordinators.delete(scrollTarget)
    },
  }
}

function cssValue(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback
}

function readTheme(element: HTMLElement): Theme {
  const styles = getComputedStyle(element)
  return {
    accent: cssValue(styles, '--veloxmd-accent', '#5b8def'),
    border: cssValue(styles, '--veloxmd-border', '#d1d9e0'),
    font: cssValue(styles, '--veloxmd-font-family', 'system-ui, sans-serif'),
    muted: cssValue(styles, '--veloxmd-text-muted', '#636c76'),
    text: cssValue(styles, '--veloxmd-text', '#1f2328'),
  }
}

function formatValue(value: number) {
  const magnitude = Math.abs(value)
  if (magnitude >= 10_000) return value.toExponential(1)
  if (magnitude >= 100) return String(Math.round(value))
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
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

function findScrollRoot(element: HTMLElement) {
  let parent = element.parentElement
  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return parent
    parent = parent.parentElement
  }
  return null
}

function drawCircle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fillStyle = color
  context.fill()
}

function drawLegend(
  context: CanvasRenderingContext2D,
  spec: ChartSpec,
  theme: Theme,
  width: number,
) {
  context.font = `11px ${theme.font}`
  context.textBaseline = 'middle'
  let x = 52
  const y = spec.title ? 38 : 18
  for (let index = 0; index < spec.series.length; index += 1) {
    const series = spec.series[index]
    const color = series.color || COLORS[index % COLORS.length]
    const labelWidth = context.measureText(series.name).width
    if (x + labelWidth + 28 > width - 12) break
    context.fillStyle = color
    context.fillRect(x, y - 4, 10, 8)
    context.fillStyle = theme.muted
    context.fillText(series.name, x + 15, y)
    x += labelWidth + 34
  }
}

function drawAxes(
  context: CanvasRenderingContext2D,
  spec: ChartSpec,
  layout: ChartLayout,
  theme: Theme,
) {
  context.font = `10px ${theme.font}`
  context.lineWidth = 1
  context.textBaseline = 'middle'
  context.textAlign = 'right'

  const yTicks = 4
  for (let index = 0; index <= yTicks; index += 1) {
    const ratio = index / yTicks
    const y = layout.bottom - ratio * layout.height
    const value = layout.minY + ratio * (layout.maxY - layout.minY)
    context.beginPath()
    context.moveTo(layout.left, Math.round(y) + 0.5)
    context.lineTo(layout.right, Math.round(y) + 0.5)
    context.strokeStyle = theme.border
    context.globalAlpha = index === 0 ? 0.8 : 0.45
    context.stroke()
    context.globalAlpha = 1
    context.fillStyle = theme.muted
    context.fillText(formatValue(value), layout.left - 7, y)
  }

  const pointCount = spec.series[0]?.values.length || 0
  const labelCount = Math.min(7, pointCount)
  const used = new Set<number>()
  context.textAlign = 'center'
  context.textBaseline = 'top'
  for (let index = 0; index < labelCount; index += 1) {
    const pointIndex = labelCount === 1
      ? 0
      : Math.round((index / (labelCount - 1)) * (pointCount - 1))
    if (used.has(pointIndex)) continue
    used.add(pointIndex)
    const label = spec.labels?.[pointIndex] ?? formatValue(spec.x?.[pointIndex] ?? pointIndex)
    context.fillStyle = theme.muted
    context.fillText(label.length > 12 ? `${label.slice(0, 11)}…` : label, chartX(spec, pointIndex, layout), layout.bottom + 8)
  }
}

function drawLineSeries(
  context: CanvasRenderingContext2D,
  spec: ChartSpec,
  series: ChartSeries,
  seriesIndex: number,
  layout: ChartLayout,
) {
  const color = series.color || COLORS[seriesIndex % COLORS.length]
  const points = series.values.map((value, pointIndex) => ({
    x: chartX(spec, pointIndex, layout),
    y: chartY(value, layout),
  }))
  if (points.length === 0) return

  if (spec.type === 'area') {
    const baseline = layout.minY <= 0 && layout.maxY >= 0 ? chartY(0, layout) : layout.bottom
    context.beginPath()
    context.moveTo(points[0].x, baseline)
    for (const point of points) context.lineTo(point.x, point.y)
    context.lineTo(points.at(-1)!.x, baseline)
    context.closePath()
    context.fillStyle = color
    context.globalAlpha = 0.16
    context.fill()
    context.globalAlpha = 1
  }

  if (spec.type !== 'scatter') {
    context.beginPath()
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y)
      else context.lineTo(point.x, point.y)
    })
    context.strokeStyle = color
    context.lineWidth = 2
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.stroke()
  }

  const radius = spec.type === 'scatter' ? 4 : 2.75
  for (const point of points) drawCircle(context, point.x, point.y, radius, color)
}

function drawBarSeries(
  context: CanvasRenderingContext2D,
  spec: ChartSpec,
  series: ChartSeries,
  seriesIndex: number,
  layout: ChartLayout,
) {
  const color = series.color || COLORS[seriesIndex % COLORS.length]
  const pointCount = series.values.length
  const step = pointCount > 1 ? layout.width / (pointCount - 1) : layout.width
  const groupWidth = Math.min(42, Math.max(8, step * 0.68))
  const barWidth = Math.max(2, groupWidth / spec.series.length)
  const baseline = chartY(0, layout)
  context.fillStyle = color

  series.values.forEach((value, pointIndex) => {
    const center = chartX(spec, pointIndex, layout)
    const x = center - groupWidth / 2 + seriesIndex * barWidth + 1
    const y = chartY(value, layout)
    context.fillRect(x, Math.min(y, baseline), Math.max(1, barWidth - 2), Math.max(1, Math.abs(baseline - y)))
  })
}

function drawChart(active: ActiveChart, spec: ChartSpec) {
  const { canvas, context, cssHeight, cssWidth, layout, theme } = active
  context.clearRect(0, 0, cssWidth, cssHeight)

  if (spec.title) {
    context.fillStyle = theme.text
    context.font = `600 14px ${theme.font}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(spec.title, cssWidth / 2, 18)
  }
  drawLegend(context, spec, theme, cssWidth)
  drawAxes(context, spec, layout, theme)

  for (let index = 0; index < spec.series.length; index += 1) {
    const series = spec.series[index]
    if (spec.type === 'bar') drawBarSeries(context, spec, series, index, layout)
    else drawLineSeries(context, spec, series, index, layout)
  }

  const pointIndex = Math.floor((spec.series[0]?.values.length || 1) / 2)
  const value = spec.series[0]?.values[pointIndex]
  if (value !== undefined) {
    canvas.dataset.editablePointSeries = '0'
    canvas.dataset.editablePointIndex = String(pointIndex)
    canvas.dataset.editablePointX = String(chartX(spec, pointIndex, layout))
    canvas.dataset.editablePointY = String(chartY(value, layout))
  }
}

export function mountChart(context: VisualBlockMountContext): VisualBlockMountHandle | void {
  const parsed = parseChart(context.source.bodyLines)
  if (!parsed.ok) {
    renderError(context.surface, parsed.errors)
    return
  }

  let spec = parsed.spec
  let active: ActiveChart | null = null
  let drag: DragState | null = null
  let drawFrame = 0
  let destroyed = false

  const chartHost = document.createElement('div')
  chartHost.className = 'veloxmd-chart-canvas'
  chartHost.style.height = `${spec.height}px`
  chartHost.dataset.chartState = 'deferred'
  chartHost.setAttribute('aria-label', spec.title ? `Chart: ${spec.title}` : 'Interactive chart')
  context.surface.appendChild(chartHost)

  const queueDraw = () => {
    if (!active || drawFrame) return
    drawFrame = requestAnimationFrame(() => {
      drawFrame = 0
      if (active) drawChart(active, spec)
    })
  }

  const resize = () => {
    if (!active) return
    const width = Math.max(280, Math.floor(chartHost.getBoundingClientRect().width || 640))
    const height = spec.height
    const ratio = RENDER_PIXEL_RATIO
    if (active.cssWidth === width && active.cssHeight === height) return

    active.cssWidth = width
    active.cssHeight = height
    active.canvas.width = Math.round(width * ratio)
    active.canvas.height = Math.round(height * ratio)
    active.canvas.style.width = `${width}px`
    active.canvas.style.height = `${height}px`
    active.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    active.layout = createChartLayout(spec, width, height)
    drawChart(active, spec)
  }

  const nearestPoint = (event: PointerEvent) => {
    if (!active) return null
    const rect = active.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    let nearest: { distance: number; pointIndex: number; seriesIndex: number } | null = null

    for (let seriesIndex = 0; seriesIndex < spec.series.length; seriesIndex += 1) {
      const series = spec.series[seriesIndex]
      for (let pointIndex = 0; pointIndex < series.values.length; pointIndex += 1) {
        const distance = Math.hypot(
          chartX(spec, pointIndex, active.layout) - x,
          chartY(series.values[pointIndex], active.layout) - y,
        )
        if (!nearest || distance < nearest.distance) nearest = { distance, pointIndex, seriesIndex }
      }
    }
    return nearest && nearest.distance <= 18 ? nearest : null
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!active || !spec.editable || event.button !== 0) return
    const nearest = nearestPoint(event)
    if (!nearest) return
    event.preventDefault()
    event.stopPropagation()
    active.canvas.setPointerCapture?.(event.pointerId)
    drag = {
      moved: false,
      originalValue: spec.series[nearest.seriesIndex].values[nearest.pointIndex],
      pointIndex: nearest.pointIndex,
      pointerId: event.pointerId,
      seriesIndex: nearest.seriesIndex,
    }
    active.canvas.classList.add('is-editing-point')
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!active || !drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    const rect = active.canvas.getBoundingClientRect()
    const value = roundedValue(chartValueAtY(event.clientY - rect.top, active.layout))
    spec = updateChartValue(spec, drag.seriesIndex, drag.pointIndex, value)
    drag.moved = true
    queueDraw()
  }

  const finishDrag = (event: PointerEvent, shouldCommit: boolean) => {
    if (!active || !drag || drag.pointerId !== event.pointerId) return
    const completed = drag
    drag = null
    active.canvas.classList.remove('is-editing-point')
    active.canvas.releasePointerCapture?.(event.pointerId)
    if (!shouldCommit && completed.moved) {
      spec = updateChartValue(spec, completed.seriesIndex, completed.pointIndex, completed.originalValue)
      queueDraw()
      return
    }
    if (completed.moved) context.commit(serializeChart(spec))
  }

  const onPointerUp = (event: PointerEvent) => finishDrag(event, true)
  const onPointerCancel = (event: PointerEvent) => finishDrag(event, false)

  const deactivate = () => {
    if (!active || drag) return
    if (drawFrame) cancelAnimationFrame(drawFrame)
    drawFrame = 0
    active.resizeObserver?.disconnect()
    active.canvas.removeEventListener('pointerdown', onPointerDown)
    active.canvas.removeEventListener('pointermove', onPointerMove)
    active.canvas.removeEventListener('pointerup', onPointerUp)
    active.canvas.removeEventListener('pointercancel', onPointerCancel)
    active.canvas.remove()
    active = null
    chartHost.dataset.chartState = 'deferred'
  }

  const activate = () => {
    if (destroyed || active) return
    const canvas = document.createElement('canvas')
    const drawingContext = canvas.getContext('2d', { alpha: true })
    if (!drawingContext) {
      chartHost.dataset.chartState = 'error'
      chartHost.textContent = 'Canvas 2D is unavailable.'
      return
    }

    canvas.className = 'veloxmd-chart-surface'
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', spec.title || 'Interactive chart')
    canvas.tabIndex = spec.editable ? 0 : -1
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerCancel)
    chartHost.appendChild(canvas)

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(resize)
    active = {
      canvas,
      context: drawingContext,
      cssHeight: 0,
      cssWidth: 0,
      layout: createChartLayout(spec, 640, spec.height),
      resizeObserver,
      theme: readTheme(chartHost),
    }
    chartHost.dataset.chartState = 'active'
    resizeObserver?.observe(chartHost)
    resize()
  }

  const scrollRoot = findScrollRoot(chartHost)
  const scrollAwareChart = registerScrollAwareChart(scrollRoot ?? window, chartHost, activate, deactivate)

  return {
    destroy() {
      destroyed = true
      scrollAwareChart.destroy()
      drag = null
      deactivate()
      if (active) {
        active.resizeObserver?.disconnect()
        active.canvas.remove()
        active = null
      }
    },
  }
}
