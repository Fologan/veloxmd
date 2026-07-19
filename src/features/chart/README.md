# Chart

Chart renders a strict, data-only JSON specification as an inline static SVG.
JavaScript callbacks, HTML formatters, `eval`, vault access, and Tauri access are
not part of the format.

````md
```chart
{
  "version": 1,
  "type": "line",
  "labels": ["Jan", "Feb", "Mar"],
  "series": [{ "name": "2026", "values": [12, 18, 15] }],
  "editable": true
}
```
````

Supported chart types are `line`, `area`, `bar`, and `scatter`. In `hybrid`, the
`Editar` button reveals the original JSON in the same Markdown document. Editing
any supported property updates the canonical Markdown; leaving the block renders
the resulting SVG again. There is no overlay, modal, portal, or second data model.

The renderer is native to VeloxMD and has no chart-library dependency. It keeps
one persistent vector drawing per Chart, at full logical resolution, with no
Canvas buffer, pointer listeners, resize observer, animation loop, or scroll
coordinator. SVG paths group bars and point markers to avoid one DOM element per
datum. Hidden source lines are detached from layout while the Markdown model
remains canonical and fully restorable.
