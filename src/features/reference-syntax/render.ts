import type { LiveSegment } from '../../types.js'

export function createReferenceNode(segment: LiveSegment): HTMLElement | null {
  if (!segment.reference) return null

  const element = document.createElement('span')
  const roleClass = segment.kind === 'reference-label'
    ? 'live-reference-label'
    : segment.kind === 'reference-target'
      ? 'live-reference-target'
      : segment.kind === 'image-alt'
        ? 'live-image-alt'
        : 'live-link-text'
  element.className = `live-reference ${roleClass}`
  if (segment.reference.embed) element.classList.add('live-embed-reference')
  if (segment.reference.label && segment.kind === 'reference-target') {
    element.classList.add('has-label')
  }
  element.textContent = segment.text
  element.dataset.referenceTarget = segment.reference.target
  element.dataset.referenceSyntax = segment.reference.syntax
  element.dataset.referenceEmbed = String(segment.reference.embed)
  if (segment.reference.label) element.dataset.referenceLabel = segment.reference.label
  return element
}
