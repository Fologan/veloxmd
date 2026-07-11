# Kanban

Feature prevista para representar tableros Kanban a partir de Markdown estructurado.

## Sintaxis candidata

La sintaxis final queda abierta, pero debe ser Markdown legible en crudo. Ejemplos posibles:

````md
```kanban
## Por hacer
- [ ] Diseñar parser

## En curso
- [ ] Probar hybrid

## Hecho
- [x] Definir carpeta
```
````

Otra alternativa futura puede usar headings y task lists sin fence, siempre que el parser mantenga reglas claras.

## Decision de organizacion

Kanban debe vivir aqui como feature Markdown del engine. No debe mezclarse con vaults, tabs, memoria ni UI de la app.

## Puntos que debe resolver la implementacion futura

- Modelo interno de columnas y tarjetas.
- Render en `static`, `source` y `hybrid`.
- Edicion sin perder el Markdown original.
- Reglas para checkboxes, prioridades, etiquetas y metadatos.
- Tests con columnas vacias, tarjetas multilinea y contenido invalido.

## Estado

Scaffold de organizacion. Sin runtime activo.
