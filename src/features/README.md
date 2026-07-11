# Features Markdown

Esta carpeta es el punto de crecimiento para extensiones de Markdown de VeloxMD.

Una feature es una sintaxis o visualizacion especializada que afecta el parseo o render del documento: Mermaid, Kanban, admonitions, diagramas, math avanzado, timelines, etc.

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

## Features previstas

- `mermaid/`: diagramas declarados con code fences u otra sintaxis compatible.
- `kanban/`: tableros derivados de Markdown estructurado.

Estas carpetas son scaffolds de organizacion. No tienen runtime activo todavia.
