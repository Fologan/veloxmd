# @fologan/veloxmd

## Propósito

Engine Markdown de Zafiro: parser, render, viewer y editor in-place.

## Reglas

- No importar Tauri.
- No conocer memoria, tabs, datasets, LLMs ni embeddings.
- Mantenerlo extraible como carpeta completa.
- Nuevas features Markdown van en `src/features/<feature-id>/`, una feature por carpeta.
- No meter Mermaid, Kanban u otras extensiones grandes directamente en `parse-block-plus.ts`, `render-plus.ts` o `styles.css`; esos archivos solo deben orquestar/adaptar cuando exista runtime.
- Después de tocar runtime del engine, correr `pnpm --filter @fologan/veloxmd test`.
