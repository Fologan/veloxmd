# Tables

Feature de tablas Markdown y de texto plano de VeloxMD.

## Limite

Esta carpeta contiene todo el comportamiento propio de tablas:

- `types.ts` y `model.ts`: modelo compartido y estilos de borde.
- `parse.ts` y `line.ts`: sintaxis, clases y rangos del parser Markdown canónico; no existe un segundo parser de documentos.
- `unicode-width.ts`: segmentacion por grafemas y medicion con la fuente activa.
- `live-render.ts`: representacion editable medida. Las columnas enteras crecen con espacios; sólo las métricas fraccionarias usan anclas con tab de dos celdas.
- `portable-render.ts`: salida Unicode por celdas, normalizada y sin tabs.
- `clipboard.ts`: selección completa, Copiar y Copy Code sobre la salida portable.
- `static-render.ts` y `overlay.ts`: tabla HTML de lectura y montaje `hybrid` sin foco.
- `controller.ts` y `toolbar.ts`: adaptadores del editor y del portapapeles.

VeloxMD conserva el cálculo puro y la edición Markdown. Zafiro sólo instancia el editor y reenvía el evento de carga de fuentes mediante `refreshTableFontMetrics()`; la feature no conoce Tauri, vaults, backlinks, búsqueda, SQLite, memoria ni embeddings.

## Dos salidas

El mismo `TableModel` produce dos representaciones deliberadamente distintas:

1. `renderTableText`: salida viva. Mide grafemas con un `span` oculto configurado desde la fuente computada del editor y usa Canvas como fallback.
2. `renderPortableTable`: salida para copiar o exportar. Calcula anchuras Unicode enteras, toma el máximo por columna, rellena sólo con U+0020 y nunca emite U+0009.

`portableTableTextForSelection` recibe `parseLiveDocumentPlus` como dependencia. Así, Ctrl+C sobre una tabla completa reutiliza el parser canónico y no duplica la sintaxis de tablas.

## Bordes y alineaciones

Ambos renderizadores soportan `markdown`, `box`, `double` y `ascii`, además de `left`, `right`, `center` y `justify`. VeloxMD conserva `::---::` como marcador propio de justificado para que esa alineación sobreviva al ciclo de edición.

## Fuente

La implementación adapta el contrato modular de `C:\CODE\Realtime\codex` (`unicode-width.js`, `text-table-engine.js` y `portable-table-engine.js`). No incorpora `ratio-r6.html`, `index.html`, `styles.css` ni la interfaz completa de demostración.
