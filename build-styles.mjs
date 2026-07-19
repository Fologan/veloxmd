import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const sourcePath = resolve(root, 'src/styles.css')
const featurePaths = [
  resolve(root, 'src/features/visual-blocks/styles.css'),
  resolve(root, 'src/features/board/styles.css'),
  resolve(root, 'src/features/chart/styles.css'),
]

const source = await readFile(sourcePath, 'utf8')
const base = source.replace(/^@import ['"].+?['"];\r?\n/gm, '').trimStart()
const features = await Promise.all(featurePaths.map(path => readFile(path, 'utf8')))
const output = [base.trimEnd(), ...features.map(css => css.trim())].join('\n\n') + '\n'

await mkdir(resolve(root, 'dist'), { recursive: true })
await writeFile(resolve(root, 'dist/styles.css'), output, 'utf8')
