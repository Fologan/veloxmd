# TODO interno — no publicar

## Table Engine — Pendiente 🔧

- [ ] **Edición source con celdas adaptables** — Interceptar `onInput`/`onKeyDown` dentro de table blocks para edición celda-por-celda con padding en tiempo real (usar `cursorToTableCell`/`tableCellToCursor` del engine)
- [ ] **Conectar TableToolbar al editor** — Mostrar toolbar flotante cuando el cursor está en una tabla, ocultar al salir
- [ ] **Tab/Enter navigation** — Tab → siguiente celda, Shift+Tab → anterior, Enter → nueva fila
- [ ] **Acciones del toolbar** — Implementar add row/col, delete row/col, sort A-Z/Z-A, set alignment, copy
- [ ] **Múltiples estilos de borde** — Selector markdown/box/double/ascii (engine ya lo soporta con `TABLE_BORDERS`)
- [ ] **Tests para table-engine** — Unit tests para `renderTableText`, `cursorToTableCell`, `displayWidth`, etc.

## Rendimiento

- [ ] Render por bloque afectado (reemplaza el renderAll actual)

### Diseño: render por bloque

**Problema:** `renderAll()` re-parsea y re-renderiza las N líneas del documento en cada tecla.
En docs de 500+ líneas lagea en mobile (20-60ms por keystroke, budget es 16ms).

**Solución:** detectar qué bloque cambió y solo re-renderizar ese bloque.

Un "bloque" es una unidad lógica:
- Heading → 1 línea
- Párrafo → 1 línea
- Tabla → desde el header hasta la última row (multi-línea)
- Code block → desde ``` hasta ``` (multi-línea)
- Details → desde `<details>` hasta `</details>` (multi-línea)
- Math block → desde $$ hasta $$ (multi-línea)

**Flujo:**
1. En `onInput`, comparar `this.lines` antes/después para saber qué línea cambió
2. Buscar a qué bloque pertenece esa línea (los parsers ya lo saben: `inCodeBlock`, `inTable`, etc.)
3. Re-parsear solo las líneas de ese bloque
4. Hacer swap del DOM solo para ese bloque (no innerHTML = '' de todo)
5. Si el tipo de bloque cambió (ej: escribiste ``` y ahora es code block), fallback a `renderAll()`

**Medición de bloques (aritmética real):**
El swap de un bloque en el DOM requiere conocer su tamaño real completo.
No se puede hacer línea por línea — un párrafo es una unidad visual completa.
Al reemplazar un bloque:
1. Medir el alto real del bloque viejo en el DOM (getBoundingClientRect)
2. Crear el bloque nuevo, insertarlo
3. Si la altura cambia, el browser hace reflow solo de lo que está debajo, no de todo
4. En hybrid mode, recalcular anchos de syntax con canvas.measureText para el bloque nuevo

Esto conecta con el HybridController: hoy mide anchos de syntax spans para animaciones.
Con render por bloque, esa medición se vuelve necesaria para que el swap no produzca saltos
visuales. La aritmética pasa de ser cosmética (animaciones) a estructural (layout correcto).

**Fallback seguro:** cualquier caso no contemplado → `renderAll()` como hoy. No se pierde nada.

**Impacto estimado (doc 1000 líneas):**
- Parse: de 1000 líneas a ~1-10 (el bloque)
- DOM: de crear/destruir 1000 divs a swap de 1-10
- Mobile: de 20-60ms a <2ms por tecla

## Otros

- [ ] Issue templates para bug reports
- [ ] CONTRIBUTING.md si se abre a contribuciones
