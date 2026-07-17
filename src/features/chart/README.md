# Chart

Chart renders a strict, data-only JSON specification as an inline Canvas chart.
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

Supported chart types are `line`, `area`, `bar`, and `scatter`. A dragged point
updates Canvas during the gesture and commits one canonical Markdown change when
the pointer is released.
