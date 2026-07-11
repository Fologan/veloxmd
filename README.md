# VeloxMD

Engine de Markdown in-place para web, sin dependencias de runtime. El texto se formatea en el mismo lugar donde se edita y conserva paridad de caracteres entre el Markdown crudo y el DOM.

Este repositorio es el espejo standalone del engine que vive dentro de Zafiro. La versión actual es `0.1.0-alpha.5`.

## Fuente de verdad

La copia canónica y viva está en:

```text
C:\CODE\Zafiro\packages\@fologan\veloxmd
```

La dirección de sincronización es siempre:

```text
Zafiro (canónico) -> C:\CODE\veloxmd (espejo standalone)
```

Los cambios de runtime no deben desarrollarse primero en este espejo para copiarlos después a Zafiro. El payload compartido incluye `src/`, `test/`, las configuraciones de TypeScript, tsup y Vitest, `LICENSE`, `AGENTS.md` y `UBIQUITOUS_LANGUAGE.md`.

El shell propio de este repositorio se conserva aparte: `.git`, `.github`, `.gitignore`, `index.html`, `spec/`, `TODO.md`, `package-lock.json` y los archivos locales ignorados. El nombre de paquete standalone continúa siendo `veloxmd`; dentro del monorepo canónico se llama `@fologan/veloxmd`.

## Límite de responsabilidad

VeloxMD contiene exclusivamente capacidades del engine Markdown:

- Parseo inline y por bloques.
- Render DOM y estilos.
- Viewer de solo lectura.
- Editor in-place y manejo de selección/cursor.
- Modos `source` y `hybrid`.
- Toolbar y edición de tablas.
- Reconocimiento de sintaxis de referencias.

VeloxMD no contiene ni debe contener:

- Apertura o escaneo de vaults.
- Resolución de rutas o navegación entre archivos.
- Índices, backlinks o búsqueda.
- Persistencia, SQLite o acceso al filesystem.
- Memoria, datasets, embeddings o LLMs.
- Tauri o lógica propia de una aplicación host.

La feature `reference-syntax` sólo reconoce links Markdown, imágenes, `[[wikilinks]]` y `![[embeds]]`. Preserva el texto fuente y expone metadatos genéricos `data-reference-*`; resolver el destino corresponde por completo a la aplicación consumidora.

## Consumo local

No es necesario publicar nada en npm.

Primero prepara el engine:

```powershell
cd C:\CODE\veloxmd
npm install
npm run build
```

Después, desde una aplicación hermana como FastMD:

```powershell
cd C:\CODE\FastMD
npm install ..\veloxmd
```

La dependencia resultante puede declararse de forma reproducible así:

```json
{
  "dependencies": {
    "veloxmd": "file:../veloxmd"
  }
}
```

El paquete exporta archivos generados en `dist/`, por lo que el engine debe compilarse después de sincronizar cambios y antes de ejecutar o construir la aplicación consumidora.

## Uso rápido

```ts
import { LiveEditorPlus } from 'veloxmd'
import 'veloxmd/styles.css'

const editor = new LiveEditorPlus(document.getElementById('editor')!, {
  toolbar: true,
  placeholder: 'Escribe Markdown...',
  onChange: (markdown) => console.log(markdown),
})

editor.setValue('# Hola **mundo**')
editor.setViewMode('hybrid')
```

Viewer estático:

```ts
import { LiveViewer } from 'veloxmd'
import 'veloxmd/styles.css'

const viewer = new LiveViewer(document.getElementById('preview')!)
viewer.setValue('# Documento')
```

## Modos

| Modo | Superficie | Comportamiento |
| --- | --- | --- |
| `source` | `LiveEditorPlus` | Markdown editable con sintaxis visible. |
| `hybrid` | `LiveEditorPlus` | Oculta sintaxis no enfocada y la revela al editar, optimizado por bloque. |
| `static` | `LiveViewer` | Render de solo lectura sin `contenteditable`. |

## Capacidades actuales

- Headings, párrafos, blockquotes, listas y horizontal rules.
- Bold, italic, bold-italic, strikethrough y código inline.
- Links, imágenes, autolinks y links de referencia.
- Wikilinks y embeds con metadata genérica no resuelta.
- Code fences, task lists, footnotes y HTML inline soportado.
- Math inline y por bloque, highlight, superíndice y subíndice.
- Tablas con alineación, render estático y edición asistida.
- Details/summary y alt headings.
- Toolbar, atajos, undo/redo, clipboard e IME/composition.
- Selección entre líneas, navegación por teclado y autoscroll del caret.
- Render incremental por bloque con fallback seguro a render completo.
- Character parity: cada carácter del Markdown crudo permanece representado en el DOM editable.

Las carpetas `features/mermaid` y `features/kanban` son scaffolds de organización; todavía no contienen runtime activo.

## API principal

```ts
new LiveEditor(container, options)
new LiveEditorPlus(container, options)
new LiveViewer(container)

editor.setValue(markdown)
editor.getValue()
editor.setViewMode('source' | 'hybrid')
editor.insert(text)
editor.toggleInline(before, after, placeholder)
editor.toggleBlock(prefix)
editor.insertTemplate(template)
editor.undo()
editor.redo()
editor.destroy()
```

También se exportan parsers, renderers, utilidades de cursor y primitives del table engine desde `src/index.ts`.

## Verificación

```powershell
npm test
npm run build:check
npm run build
```

`dist/` es un artefacto local generado y no forma parte del payload sincronizado ni del control de versiones.

## Publicación

El flujo local mediante `file:../veloxmd` cubre el consumo entre los tres repositorios. Esta puesta al corriente no requiere `npm publish`, un registro privado ni `npm link` global.

## Licencia

[MIT](LICENSE) - Fologan
