import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const stylePath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles.css')

function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))
  return match?.[1] ?? ''
}

describe('hybrid syntax styling', () => {
  it('lets Source own the visual style of visible markdown syntax', () => {
    const css = readFileSync(stylePath, 'utf8')
    const hybridSyntaxBody = ruleBody(css, '.hybrid-mode .live-line .syntax')
    const hybridFocusedSyntaxBody = ruleBody(css, '.hybrid-mode .live-line.focused .syntax')

    expect(hybridSyntaxBody).not.toMatch(
      /\b(color|font-size|font-weight|font-style|text-decoration|opacity|vertical-align)\s*:/,
    )
    expect(hybridFocusedSyntaxBody).not.toMatch(
      /\b(color|font-size|font-weight|font-style|text-decoration|opacity|vertical-align)\s*:/,
    )
  })
})
