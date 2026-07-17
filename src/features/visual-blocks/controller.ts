import { boardFeature } from '../board/index.js'
import { chartFeature } from '../chart/index.js'
import type {
  VisualBlockCommit,
  VisualBlockFeature,
  VisualBlockMode,
  VisualBlockMountHandle,
  VisualBlockSource,
} from './types.js'

const OPEN_FENCE = /^(\s*)```([a-z][\w-]*)(?:\s+(.*?))?\s*$/i
const CLOSE_FENCE = /^\s*```\s*$/

type MountedVisualBlock = {
  cancelled: boolean
  feature: VisualBlockFeature
  handle: VisualBlockMountHandle | null
  host: HTMLElement
  signature: string
  source: VisualBlockSource
  sourceElements: HTMLElement[]
  wrapper: HTMLElement
}

const FEATURES = new Map<string, VisualBlockFeature>(
  [boardFeature, chartFeature].map(feature => [feature.id, feature]),
)

function findVisualBlocks(lines: string[]): VisualBlockSource[] {
  const blocks: VisualBlockSource[] = []

  for (let start = 0; start < lines.length; start += 1) {
    const opening = lines[start].match(OPEN_FENCE)
    if (!opening) continue

    const id = opening[2].toLowerCase()
    if (!FEATURES.has(id)) continue

    let end = start + 1
    while (end < lines.length && !CLOSE_FENCE.test(lines[end])) end += 1
    if (end >= lines.length) continue

    blocks.push({
      id,
      startLine: start,
      endLine: end,
      openLine: lines[start],
      bodyLines: lines.slice(start + 1, end),
      closeLine: lines[end],
      info: opening[3]?.trim() || '',
    })
    start = end
  }

  return blocks
}

function blockSignature(source: VisualBlockSource) {
  return [source.openLine, ...source.bodyLines, source.closeLine].join('\n')
}

function renderMountError(surface: HTMLElement, error: unknown) {
  surface.replaceChildren()
  const message = document.createElement('p')
  message.className = 'veloxmd-visual-error'
  message.textContent = error instanceof Error ? error.message : 'Visual block could not be rendered.'
  surface.appendChild(message)
}

export class VisualBlockController {
  private entries = new Map<number, MountedVisualBlock>()

  sync(
    root: HTMLElement,
    lines: string[],
    mode: VisualBlockMode,
    commit: VisualBlockCommit,
  ): void {
    const sources = findVisualBlocks(lines)
    const nextStarts = new Set(sources.map(source => source.startLine))

    for (const [start, entry] of this.entries) {
      if (!nextStarts.has(start) || !entry.host.isConnected) {
        this.destroyEntry(entry)
        this.entries.delete(start)
      }
    }

    for (const source of sources) {
      const feature = FEATURES.get(source.id)
      if (!feature) continue

      const sourceElements: HTMLElement[] = []
      for (let line = source.startLine; line <= source.endLine; line += 1) {
        const element = root.querySelector<HTMLElement>(`[data-line="${line}"]`)
        if (element) sourceElements.push(element)
      }
      if (sourceElements.length !== source.endLine - source.startLine + 1) continue

      const focused = mode === 'hybrid' && sourceElements.some(element => element.classList.contains('focused'))
      const signature = blockSignature(source)
      const current = this.entries.get(source.startLine)

      if (focused) {
        if (current) {
          this.destroyEntry(current)
          this.entries.delete(source.startLine)
        }
        continue
      }

      if (
        current &&
        current.signature === signature &&
        current.host === sourceElements[0] &&
        current.wrapper.isConnected
      ) {
        continue
      }

      if (current) this.destroyEntry(current)
      const entry = this.mountEntry(root, source, sourceElements, feature, mode, commit)
      this.entries.set(source.startLine, entry)
    }
  }

  destroy(): void {
    for (const entry of this.entries.values()) this.destroyEntry(entry)
    this.entries.clear()
  }

  private mountEntry(
    root: HTMLElement,
    source: VisualBlockSource,
    sourceElements: HTMLElement[],
    feature: VisualBlockFeature,
    mode: VisualBlockMode,
    commit: VisualBlockCommit,
  ): MountedVisualBlock {
    const host = sourceElements[0]
    host.classList.add('veloxmd-visual-host')
    host.style.setProperty('--veloxmd-visual-min-height', `${feature.minHeight}px`)
    for (const element of sourceElements) element.classList.add('veloxmd-visual-source-hidden')

    const wrapper = document.createElement('section')
    wrapper.className = `veloxmd-visual-block veloxmd-${feature.id}-block`
    wrapper.contentEditable = 'false'
    wrapper.dataset.visualBlock = feature.id
    wrapper.dataset.startLine = String(source.startLine)
    wrapper.dataset.visualState = 'loading'
    wrapper.setAttribute('aria-label', `${feature.id} visual block`)

    if (mode === 'hybrid') {
      const controls = document.createElement('div')
      controls.className = 'veloxmd-visual-controls'
      const editSource = document.createElement('button')
      editSource.type = 'button'
      editSource.className = 'veloxmd-visual-source-button'
      editSource.textContent = 'Markdown'
      editSource.addEventListener('click', () => this.revealSource(root, source.startLine))
      controls.appendChild(editSource)
      wrapper.appendChild(controls)
    }

    const surface = document.createElement('div')
    surface.className = 'veloxmd-visual-surface'
    wrapper.appendChild(surface)
    host.appendChild(wrapper)

    const entry: MountedVisualBlock = {
      cancelled: false,
      feature,
      handle: null,
      host,
      signature: blockSignature(source),
      source,
      sourceElements,
      wrapper,
    }

    const mount = () => feature.mount({
      surface,
      source,
      mode,
      commit: bodyLines => {
        if (entry.cancelled) return
        commit(source.startLine, source.endLine + 1, [source.openLine, ...bodyLines, source.closeLine])
      },
    })

    try {
      Promise.resolve(mount())
        .then(handle => {
          wrapper.dataset.visualState = 'ready'
          if (!handle) return
          if (entry.cancelled) handle.destroy()
          else entry.handle = handle
        })
        .catch(error => {
          if (!entry.cancelled) {
            wrapper.dataset.visualState = 'error'
            renderMountError(surface, error)
          }
        })
    } catch (error) {
      wrapper.dataset.visualState = 'error'
      renderMountError(surface, error)
    }

    return entry
  }

  private revealSource(root: HTMLElement, startLine: number) {
    const entry = this.entries.get(startLine)
    if (!entry) return
    this.destroyEntry(entry)
    this.entries.delete(startLine)

    const targetLine = Math.min(entry.source.endLine, entry.source.startLine + 1)
    const target = root.querySelector<HTMLElement>(`[data-line="${targetLine}"]`)
    if (!target) return

    requestAnimationFrame(() => {
      root.focus({ preventScroll: true })
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
      const textNode = walker.nextNode()
      if (!textNode) return
      const range = document.createRange()
      range.setStart(textNode, 0)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
  }

  private destroyEntry(entry: MountedVisualBlock) {
    entry.cancelled = true
    entry.handle?.destroy()
    entry.wrapper.remove()
    entry.host.classList.remove('veloxmd-visual-host')
    entry.host.style.removeProperty('--veloxmd-visual-min-height')
    for (const element of entry.sourceElements) element.classList.remove('veloxmd-visual-source-hidden')
  }
}
