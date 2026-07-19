# Features Markdown

Esta carpeta es el punto de crecimiento para extensiones de Markdown de VeloxMD.

Una feature es una sintaxis o visualizacion especializada que afecta el parseo o render del documento: Board, Chart, Mermaid, admonitions, diagramas, math avanzado, timelines, etc.

## Regla

```txt
una feature = una carpeta
```

La forma recomendada es:

```txt
src/features/<feature-id>/
  README.md
  manifest.ts
  parse.ts
  render.ts
  styles.css
  types.ts
  index.ts
  test-data/
```

No crear imports directos desde la app hacia estas carpetas. La app sigue consumiendo `@fologan/veloxmd` por `src/index.ts`.

## Limites

- Esta carpeta pertenece al engine Markdown, no a Zafiro app shell.
- No usar Tauri, rutas del usuario, vaults, memoria, datasets, embeddings ni LLMs.
- Mantener character parity: el texto Markdown crudo debe seguir siendo la fuente editable.
- Definir comportamiento para `static`, `source` y `hybrid`.
- Prefijar clases CSS con `veloxmd-<feature-id>-`.

## Runtime activo

- `tables/`: tablas Markdown, edición medida por fuente y exportación portable Unicode sin tabs.
- `visual-blocks/`: lifecycle y transaccion comun para bloques fenced visuales.
- `board/`: columnas y tarjetas derivadas de tareas Markdown; drag nativo con Pointer Events.
- `chart/`: lineas, areas, barras y dispersion como SVG estatico; edicion del spec JSON estricto mediante `Editar`.
- `reference-syntax/`: metadatos puros de referencias Markdown/Obsidian.

`mermaid/` permanece como scaffold sin runtime. Board es el nombre propio de la feature; no existe un modulo `kanban/` paralelo.
