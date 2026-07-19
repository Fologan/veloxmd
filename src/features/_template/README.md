# Plantilla de feature

Copiar esta estructura al crear una nueva feature:

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

## README de la feature

Cada feature debe documentar:

- Sintaxis Markdown soportada.
- Ejemplos de entrada.
- Resultado esperado en `static`, `source` y `hybrid`.
- Dependencias externas, si existen.
- Reglas de seguridad.
- Casos borde conocidos.
- Tests o fixtures obligatorios.

## Checklist de implementacion futura

- La feature no importa desde `apps/desktop`.
- La feature no conoce Tauri, vaults, tabs, memoria, datasets, embeddings ni LLMs.
- La feature conserva el texto crudo como fuente editable.
- El render no rompe seleccion/cursor.
- Los estilos usan prefijo `veloxmd-<feature-id>-`.
- Hay pruebas en el paquete `@fologan/veloxmd`.
