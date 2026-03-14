# Graph View Widget Requirements

## Overview

A visual graph widget for Outline that displays document relationships similar to Obsidian's Graph View. This widget shows documents as nodes and their internal links as edges, enabling users to visualize and navigate their knowledge base structure.

## Core Constraints

### 1. Zero Outline Modification
- **No changes to Outline source code** - All functionality implemented externally
- Use Outline's public API only for document/collection data
- Widget injected via Gateway bootstrap script (existing pattern)
- Link data stored in our own database tables

### 2. Independent Widget Architecture
- **Completely separate from AI Copilot widget**
- Own source directory: `widget-framework/src/widgets/graph-view/`
- Own bundle: `graph-view.js`
- Own manifest entry
- Can be enabled/disabled independently
- Can be modified without affecting other widgets

### 3. Containerized Deployment
- Runs within existing widget-framework container
- Backend endpoints in AI Service (separate route file)
- No additional containers or services required

---

## MVP Features (Phase 1)

### Graph Views

#### Global Graph
- Display all documents across all collections
- Show all internal links between documents
- Default view when opening the widget

#### Local Graph
- Display connections for the current document only
- **Depth slider**: Control how many levels of connections to show (1-3 levels)
- Automatically focuses on current document when opened

### Node Interactions

| Action | Behavior |
|--------|----------|
| Click node | Navigate to that document |
| Hover node | Highlight node and its direct connections |
| Drag node | Reposition node (physics continues) |
| Double-click | Open document in new tab |

### Navigation Controls

| Control | Behavior |
|---------|----------|
| Scroll wheel | Zoom in/out |
| Click + drag (background) | Pan the view |
| Fit button | Reset zoom to show all nodes |
| Center button | Center on current document |

### Filtering

- **Collection filter**: Dropdown to show only documents from selected collection(s)
- **Search box**: Find and focus on a specific document by name
- **Show/hide orphans**: Toggle documents with no links
- **Show/hide collections**: Toggle collection nodes in the graph

### Visual Design

- **Node size**: Based on connection count (more links = larger node)
- **Node color**: Based on collection (each collection has distinct color)
- **Current document**: Highlighted with ring/glow effect
- **Link lines**: Semi-transparent, darker when hovering connected nodes
- **Dark/light mode**: Match Outline's current theme

### Access Points

1. **Floating button**: Bottom-right area (offset from AI Copilot button)
   - Icon: Network/graph icon
   - Tooltip: "Graph View"

2. **Keyboard shortcut**: `Cmd/Ctrl + G` to toggle graph view

3. **Full-screen overlay**: Graph opens as modal overlay
   - Close button (X) in corner
   - Click outside or press Escape to close

---

## Future Features (Phase 2)

### Custom Color Groups
- Create named groups with custom colors
- Assign documents to groups via search query
- Example: All docs containing "API" shown in blue

### Physics Controls Panel
- Center force strength slider
- Repel force slider
- Link distance slider
- Enable/disable physics toggle

### Save Presets
- Save current filter + display settings
- Load saved presets
- Share presets (export/import)

### Advanced Filters
- Filter by document properties/metadata
- Filter by creation/modification date
- Regex search support

### Graph Analysis
- Show most connected documents
- Identify isolated clusters
- Highlight broken links (linked docs that don't exist)

---

## Technical Implementation

### Backend (AI Service)

**New Route File**: `ai-service/src/routes/graph.ts`

#### Endpoints

```
GET /ai/graph/documents
```
Returns all documents with their outgoing links.

Response:
```json
{
  "nodes": [
    {
      "id": "doc-uuid",
      "title": "Document Title",
      "collectionId": "collection-uuid",
      "collectionName": "Collection Name",
      "linkCount": 5
    }
  ],
  "edges": [
    {
      "source": "doc-uuid-1",
      "target": "doc-uuid-2"
    }
  ]
}
```

```
GET /ai/graph/local/:documentId?depth=2
```
Returns connections for a specific document up to specified depth.

#### Link Extraction Logic
1. Fetch all documents via Outline API
2. Parse document content for internal links:
   - Markdown links: `[text](/doc/slug)` or `[text](/doc/uuid)`
   - Direct URLs: `https://domain/doc/slug`
3. Build node and edge arrays
4. Cache results (invalidate on document update)

### Frontend (Widget Framework)

**Widget Directory**: `widget-framework/src/widgets/graph-view/`

```
graph-view/
  index.ts          # Main widget code
  styles.ts         # Styled components / CSS
  types.ts          # TypeScript interfaces
```

#### Dependencies
- `vis-network`: Graph rendering library
- `vis-data`: DataSet management

#### Widget Registration
```typescript
{
  id: 'graph-view',
  name: 'Graph View',
  version: '1.0.0',
  slot: 'floating',
  position: { bottom: 80, right: 24 },
  priority: 90
}
```

### Database

**No new tables required for MVP** - Link data extracted on-demand from documents.

Future optimization: Cache extracted links in `ai_document_links` table.

---

## User Flow

### Opening Graph View
1. User clicks Graph View button (or presses Cmd+G)
2. Full-screen overlay appears with loading spinner
3. Backend fetches/extracts document links
4. Graph renders with force-directed layout
5. Current document (if on a doc page) is highlighted and centered

### Navigating
1. User sees document clusters
2. Hovers over node to see title and connections
3. Clicks node to navigate
4. Graph closes, selected document opens

### Filtering
1. User clicks filter dropdown
2. Selects one or more collections
3. Graph updates to show only matching documents
4. Unconnected nodes from filter hidden or grayed out

---

## Success Criteria

1. Graph renders within 3 seconds for up to 500 documents
2. Smooth 60fps interactions (zoom, pan, drag)
3. Works in both dark and light mode
4. No modifications to any Outline source files
5. Widget loads/unloads independently of other widgets
6. Keyboard shortcut works globally

---

## References

- [Obsidian Graph View Documentation](https://help.obsidian.md/plugins/graph)
- [vis-network Documentation](https://visjs.github.io/vis-network/docs/)
- [Outline API Documentation](https://www.getoutline.com/developers)
