# Board

Board is VeloxMD's native Markdown-backed lanes-and-cards feature. It does not
depend on Obsidian, SortableJS, a framework, a vault, or Tauri.

````md
```board
## To do
- [ ] Define the model
- [ ] Implement drag and drop

## Done
- [x] Choose a Markdown syntax
```
````

- `##` headings are columns.
- Markdown tasks are cards.
- Dragging a card rewrites only this fenced block through the editor transaction.
- `source` shows raw Markdown; `hybrid` and `static` show the inline board.
- Invalid input stays recoverable through its raw Markdown source.
