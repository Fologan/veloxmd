// =============================================================================
// Cursor Helpers — flat offset ↔ DOM position
//
// Because every raw character exists in the DOM, the flat character offset
// in the raw text is identical to the flat offset in the DOM text nodes.
// =============================================================================

export function getFlatOffset(container: Node, targetNode: Node, targetOffset: number): number {
  let offset = 0
  const walk = (node: Node): boolean => {
    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += targetOffset
      } else {
        for (let c = 0; c < targetOffset && c < node.childNodes.length; c++) {
          offset += (node.childNodes[c].textContent || '').length
        }
      }
      return true
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += (node.textContent || '').length
    } else {
      for (const child of node.childNodes) {
        if (walk(child)) return true
      }
    }
    return false
  }
  walk(container)
  return offset
}

export function setFlatOffset(container: Node, target: number): { node: Node; offset: number } | null {
  let remaining = target
  const walk = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || '').length
      if (remaining <= len) return { node, offset: remaining }
      remaining -= len
      return null
    }
    for (const child of node.childNodes) {
      const r = walk(child)
      if (r) return r
    }
    return null
  }
  return walk(container) ?? (remaining === 0 ? { node: container, offset: container.childNodes.length } : null)
}
