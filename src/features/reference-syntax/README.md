# Reference syntax

Pure inline syntax support for Markdown links/images and `[[wikilinks]]` / `![[embeds]]`.

- Parsing preserves every source character.
- Rendering exposes raw, unresolved metadata through generic `data-reference-*` attributes.
- The engine does not know whether a host uses files, URLs, a wiki, or a vault.
- Resolution, navigation, filesystem access, indexes, backlinks, search, and broken-link creation belong to the host application.
