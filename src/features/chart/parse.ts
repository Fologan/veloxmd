import type { ChartKind, ChartParseResult, ChartSeries, ChartSpec } from './types.js'

const CHART_TYPES = new Set<ChartKind>(['line', 'area', 'bar', 'scatter'])
const ROOT_KEYS = new Set(['version', 'type', 'title', 'labels', 'x', 'series', 'editable', 'height'])
const SERIES_KEYS = new Set(['name', 'values', 'color'])
const MAX_SERIES = 16
const MAX_POINTS = 20_000

function finiteNumbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(item => typeof item === 'number' && Number.isFinite(item))
}

export function parseChart(bodyLines: string[]): ChartParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(bodyLines.join('\n'))
  } catch (error) {
    return {
      ok: false,
      errors: [`Chart JSON is invalid: ${error instanceof Error ? error.message : 'unknown error'}`],
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Chart must contain a JSON object.'] }
  }

  const input = raw as Record<string, unknown>
  const errors: string[] = []
  for (const key of Object.keys(input)) {
    if (!ROOT_KEYS.has(key)) errors.push(`Unknown chart property: ${key}.`)
  }
  if (input.version !== 1) errors.push('version must be 1.')

  const type = input.type
  if (typeof type !== 'string' || !CHART_TYPES.has(type as ChartKind)) {
    errors.push('type must be line, area, bar, or scatter.')
  }

  const labels = input.labels
  const x = input.x
  if (labels !== undefined && (!Array.isArray(labels) || !labels.every(item => typeof item === 'string'))) {
    errors.push('labels must be an array of strings.')
  }
  if (x !== undefined && !finiteNumbers(x)) errors.push('x must be an array of finite numbers.')
  if (labels === undefined && x === undefined) errors.push('Chart requires labels or x values.')
  if (labels !== undefined && x !== undefined) errors.push('Chart must use labels or x values, not both.')

  if (input.title !== undefined && typeof input.title !== 'string') {
    errors.push('title must be a string.')
  }
  if (input.editable !== undefined && typeof input.editable !== 'boolean') {
    errors.push('editable must be a boolean.')
  }
  if (
    input.height !== undefined &&
    (typeof input.height !== 'number' || !Number.isFinite(input.height) || input.height < 180 || input.height > 640)
  ) {
    errors.push('height must be a finite number between 180 and 640.')
  }

  const pointCount = Array.isArray(labels) ? labels.length : Array.isArray(x) ? x.length : 0
  if (pointCount === 0) errors.push('Chart requires at least one point.')
  if (pointCount > MAX_POINTS) errors.push(`Chart is limited to ${MAX_POINTS} points per series.`)

  const seriesInput = input.series
  if (!Array.isArray(seriesInput) || seriesInput.length === 0) {
    errors.push('Chart requires at least one series.')
  } else if (seriesInput.length > MAX_SERIES) {
    errors.push(`Chart is limited to ${MAX_SERIES} series.`)
  }

  const series: ChartSeries[] = []
  if (Array.isArray(seriesInput)) {
    seriesInput.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`series[${index}] must be an object.`)
        return
      }
      const candidate = item as Record<string, unknown>
      for (const key of Object.keys(candidate)) {
        if (!SERIES_KEYS.has(key)) errors.push(`Unknown series[${index}] property: ${key}.`)
      }
      if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
        errors.push(`series[${index}].name must be a non-empty string.`)
      }
      if (!finiteNumbers(candidate.values)) {
        errors.push(`series[${index}].values must contain finite numbers.`)
      } else if (candidate.values.length !== pointCount) {
        errors.push(`series[${index}].values must have ${pointCount} entries.`)
      }
      if (candidate.color !== undefined && typeof candidate.color !== 'string') {
        errors.push(`series[${index}].color must be a string.`)
      }
      if (typeof candidate.name === 'string' && finiteNumbers(candidate.values)) {
        series.push({
          name: candidate.name,
          values: [...candidate.values],
          ...(typeof candidate.color === 'string' ? { color: candidate.color } : {}),
        })
      }
    })
  }

  if (errors.length > 0) return { ok: false, errors }

  const height = typeof input.height === 'number' && Number.isFinite(input.height)
    ? Math.round(input.height)
    : 280

  return {
    ok: true,
    spec: {
      version: 1,
      type: type as ChartKind,
      ...(typeof input.title === 'string' && input.title ? { title: input.title } : {}),
      ...(Array.isArray(labels) ? { labels: [...labels] as string[] } : {}),
      ...(finiteNumbers(x) ? { x: [...x] } : {}),
      series,
      editable: input.editable !== false,
      height,
    },
  }
}

export function serializeChart(spec: ChartSpec): string[] {
  return JSON.stringify(spec, null, 2).split('\n')
}

export function updateChartValue(
  spec: ChartSpec,
  seriesIndex: number,
  pointIndex: number,
  value: number,
): ChartSpec {
  return {
    ...spec,
    series: spec.series.map((series, index) => ({
      ...series,
      values: index === seriesIndex
        ? series.values.map((item, point) => point === pointIndex ? value : item)
        : [...series.values],
    })),
  }
}
