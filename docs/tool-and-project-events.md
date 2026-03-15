# Tool and project events

Tools emit **item lifecycle events** so your app can react to creation and edits without polling. You can subscribe on the **tool** (tool-specific) or on the **project** (any tool).

## Subscribing

**On a tool** (e.g. only rectangle creation):

```javascript
const rectangleTool = toolkit.getTool('rectangle');
rectangleTool.addEventListener('item-created', (payload) => {
  console.log('Rectangle created', payload.item);
  // e.g. create a new placeholder and keep tool active for the next rectangle
});
```

**On the project** (any annotation created or updated):

```javascript
const project = toolkit.paperScope.project;
project.on('item-created', (payload) => {
  console.log('Item created', payload.item, 'by tool', payload.tool);
});
project.on('item-updated', (payload) => {
  console.log('Item updated', payload.item);
});
```

Remove listeners when no longer needed:

- Tool: `tool.removeEventListener('item-created', callback)` (use the same function reference).
- Project: `project.off('item-created', callback)`.

## Event types

| Event | When |
|-------|------|
| **item-created** | A new annotation item was committed (first time). |
| **item-updated** | An existing item was modified (geometry edit, style, transform, or new part added). |
| **item-converted** | An item was replaced (e.g. rasterize). |

## Payload

All payloads include:

- **item** — The Paper.js item (group) that was created, updated, or replaced.
- **tool** — The tool instance that raised the event (so you can filter by tool if needed).

When a new part was added to an existing item:

- **subpathAdded** — `true` so you know the change was an added part (ring, path, segment, or stroke).
- **subpath** — The Paper.js item that was added (e.g. `paper.Path` or `paper.Group`), when the tool can provide it. Use this for the part that changed. Omitted when the tool does not expose it (e.g. brush, where the stroke is merged and not kept as a separate reference).

Same property name everywhere: when `subpathAdded` is true, check `payload.subpath` for the new part.

## Full design and per-tool details

See [tool-event-hooks-analysis.md](tool-event-hooks-analysis.md) for rationale, per-tool emit points, and editing coverage.
