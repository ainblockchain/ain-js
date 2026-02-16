# GraphBackend Interface — Implementation Guide

This document defines the `GraphBackend` interface that any graph database must implement to work with the `KnowledgeGraph` class. Use this to implement new backends (ArangoDB, Memgraph, TigerGraph, etc.) in parallel.

## Architecture

```
KnowledgeGraph (high-level API: registerTopic, explore, getLineage, takeSnapshot, ...)
    |
    +-- GraphBackend (interface: createNode, createEdge, query, ...)
            |
            +-- MemoryBackend  (Map-based, zero dependencies -- reference impl)
            +-- Neo4jBackend   (Cypher queries over bolt://)
            +-- YourBackend    (implement GraphBackend)
```

`KnowledgeGraph` handles all domain logic (content hashing, PushId generation, TxLog audit trail, snapshot logic). Your backend only needs to implement low-level graph primitives.

---

## Data Types

### GraphNode

```typescript
interface GraphNode {
  label: string;                    // Node type: 'Topic', 'Exploration', 'User', 'TxLog', 'Snapshot'
  id: string;                       // Unique identifier (topic path, PushId, address, etc.)
  properties: Record<string, any>;  // All other fields as key-value pairs
}
```

### GraphEdge

```typescript
interface GraphEdge {
  type: string;                     // Edge type: 'PARENT_OF', 'BUILDS_ON', 'CREATED', etc.
  from: string;                     // Source node id
  to: string;                       // Target node id
  properties?: Record<string, any>; // Optional edge properties (e.g., count, amount)
}
```

### AggregateResult

```typescript
interface AggregateResult {
  group: string;                    // Group key (e.g., child topic id)
  values: Record<string, number>;   // Aggregated metric values
}
```

### GraphPath

```typescript
interface GraphPath {
  nodes: GraphNode[];               // Ordered list of nodes in the path
  edges: GraphEdge[];               // Ordered list of edges connecting the nodes
}
```

### AggregateMetric

```typescript
interface AggregateMetric {
  property: string;                 // Property name to aggregate on
  fn: 'count' | 'count_distinct' | 'max' | 'avg' | 'sum';
}
```

---

## GraphBackend Interface — Method Reference

### Lifecycle

#### `initialize(): Promise<void>`

Set up the backend: create indexes, constraints, connection pools, etc. Called once before any operations.

**Neo4j example**: Create indexes on `Topic.id`, `Exploration.id`, `User.id`, `TxLog.timestamp`, `Snapshot.created_at`.

#### `close(): Promise<void>`

Release all resources (connections, memory). Called when done.

---

### Write (append-only)

#### `createNode(node: GraphNode): Promise<void>`

Insert a new node. Must fail or create a duplicate if the node already exists (append-only semantics).

**Example**: `createNode({label: 'Exploration', id: '-Abc123', properties: {title: 'GPT-3', depth: 2, ...}})`

#### `mergeNode(label: string, id: string, properties: Record<string, any>): Promise<void>`

Idempotent upsert. If node exists, merge properties (overwrite matching keys, keep others). If not, create it.

**Example**: `mergeNode('Topic', 'ai/transformers', {title: 'Transformers', description: '...'})`

**Neo4j Cypher**: `MERGE (n:Topic {id: $id}) ON CREATE SET n += $props ON MATCH SET n += $props`

#### `createEdge(edge: GraphEdge): Promise<void>`

Create a directed edge between two existing nodes. Nodes are matched by `id` (not label-specific).

**Example**: `createEdge({type: 'BUILDS_ON', from: '-Abc123', to: '-Xyz789'})`

**Neo4j Cypher**: `MATCH (a {id: $from}), (b {id: $to}) CREATE (a)-[:BUILDS_ON]->(b)`

#### `mergeEdge(edge: GraphEdge): Promise<void>`

Idempotent edge upsert. If edge exists (same type, from, to), merge properties. Otherwise create it.

#### `incrementEdgeProperty(type: string, from: string, to: string, property: string, delta: number): Promise<void>`

Atomically increment a numeric property on an edge. If the edge doesn't exist, create it with the property set to `delta`.

**Example**: `incrementEdgeProperty('EXPLORED', '0xABC...', 'ai/transformers/attention', 'count', 1)`

**Neo4j Cypher**:
```cypher
MATCH (a {id: $from}), (b {id: $to})
MERGE (a)-[r:EXPLORED]->(b)
ON CREATE SET r.count = $delta
ON MATCH SET r.count = coalesce(r.count, 0) + $delta
```

---

### Read

#### `getNode(label: string, id: string): Promise<GraphNode | null>`

Fetch a single node by label and id. Returns null if not found.

#### `findNodes(label: string, filter?: Record<string, any>): Promise<GraphNode[]>`

Find all nodes of a given label, optionally filtered by exact property matches.

**Example**: `findNodes('Exploration', {topic_path: 'ai/transformers/decoder-only'})`

#### `getChildren(parentLabel: string, parentId: string, edgeType: string, childLabel: string): Promise<GraphNode[]>`

Get all child nodes connected from a parent node via a specific edge type.

**Example**: `getChildren('Topic', 'ai/transformers', 'PARENT_OF', 'Topic')` -- returns subtopics

**Neo4j Cypher**: `MATCH (:Topic {id: $id})-[:PARENT_OF]->(c:Topic) RETURN c`

#### `getRoots(label: string, incomingEdgeType: string): Promise<GraphNode[]>`

Get all nodes of a label that have NO incoming edges of the specified type. Used to find top-level topics.

**Example**: `getRoots('Topic', 'PARENT_OF')` -- returns topics with no parent

**Neo4j Cypher**: `MATCH (t:Topic) WHERE NOT ()-[:PARENT_OF]->(t) RETURN t`

#### `getEdges(nodeId: string, edgeType: string, direction: 'in' | 'out'): Promise<GraphEdge[]>`

Get all edges of a type connected to a node, in the specified direction.

- `direction: 'out'` -- edges going FROM this node
- `direction: 'in'` -- edges coming TO this node

---

### Aggregation

#### `aggregateOverEdge(targetLabel, targetId, edgeType, sourceLabel, metrics): Promise<Record<string, number>>`

Aggregate metrics over all source nodes connected to a target node via an edge type.

**Knowledge usage**: Compute topic stats (explorer count, max depth, avg depth).

```typescript
aggregateOverEdge('Topic', 'ai/transformers/decoder-only', 'EXPLORED', 'User', [
  { property: 'explorer_count', fn: 'count' },
  { property: 'max_depth', fn: 'max' },
  { property: 'avg_depth', fn: 'avg' },
])
// Returns: { explorer_count: 1, max_depth: 3, avg_depth: 2.0 }
```

**Important**: For `max` and `avg` metrics on `depth`, the implementation must look at Exploration nodes connected via `IN_TOPIC` to the target Topic, not at the User nodes directly.

**Neo4j Cypher**:
```cypher
OPTIONAL MATCH (u:User)-[r:EXPLORED]->(t:Topic {id: $id})
OPTIONAL MATCH (e:Exploration)-[:IN_TOPIC]->(t)
RETURN count(DISTINCT u) AS explorer_count,
       CASE WHEN count(e) > 0 THEN max(e.depth) ELSE 0 END AS max_depth,
       CASE WHEN count(e) > 0 THEN avg(e.depth) ELSE 0.0 END AS avg_depth
```

#### `aggregateGrouped(parentLabel, parentId, parentToChildEdge, childLabel, childToLeafEdge, leafLabel, metrics): Promise<AggregateResult[]>`

Aggregate metrics grouped by child nodes of a parent. Used for frontier map (stats per subtopic).

```typescript
aggregateGrouped('Topic', 'ai/transformers', 'PARENT_OF', 'Topic', 'IN_TOPIC', 'Exploration', [
  { property: 'explorer_count', fn: 'count_distinct' },
  { property: 'max_depth', fn: 'max' },
  { property: 'avg_depth', fn: 'avg' },
])
// Returns: [
//   { group: 'ai/transformers/attention', values: { explorer_count: 1, max_depth: 3, avg_depth: 3.0 } },
//   { group: 'ai/transformers/decoder-only', values: { explorer_count: 1, max_depth: 3, avg_depth: 2.0 } },
//   ...
// ]
```

**Neo4j Cypher**:
```cypher
MATCH (:Topic {id: $id})-[:PARENT_OF]->(child:Topic)
OPTIONAL MATCH (u:User)-[:EXPLORED]->(child)
OPTIONAL MATCH (e:Exploration)-[:IN_TOPIC]->(child)
RETURN child.id AS group,
       count(DISTINCT u) AS explorer_count,
       CASE WHEN count(e) > 0 THEN max(e.depth) ELSE 0 END AS max_depth,
       CASE WHEN count(e) > 0 THEN avg(e.depth) ELSE 0.0 END AS avg_depth
```

---

### Graph Traversal

#### `traverse(startId: string, edgeType: string, direction: 'in' | 'out', maxDepth?: number): Promise<GraphPath[]>`

Variable-length path traversal from a start node, following edges of a specific type.

- `direction: 'out'`: Follow outgoing edges (e.g., BUILDS_ON to find ancestors)
- `direction: 'in'`: Follow incoming edges (e.g., BUILDS_ON reversed to find descendants)
- `maxDepth`: Optional limit on path length

Returns ALL paths found (not just the longest). Each path includes the start node.

**Example**: `traverse('mistral-id', 'BUILDS_ON', 'out')` -- follows BUILDS_ON chain to find ancestors

**Neo4j Cypher**: `MATCH path = (start {id: $id})-[:BUILDS_ON*]->(end) RETURN path`

#### `shortestPath(fromId: string, toId: string, edgeType: string): Promise<GraphPath | null>`

Find the shortest path between two nodes following edges of a specific type (in either direction).

**Neo4j Cypher**: `MATCH path = shortestPath((a {id: $from})-[:BUILDS_ON*]-(b {id: $to})) RETURN path`

---

### Ledger

#### `nodeCount(label?: string): Promise<number>`

Count nodes, optionally filtered by label.

#### `edgeCount(type?: string): Promise<number>`

Count edges, optionally filtered by type.

---

## Node Labels and Edge Types Used by KnowledgeGraph

### Node Labels

| Label | id field | Key properties |
|-------|----------|----------------|
| `Topic` | topic path (e.g., `ai/transformers`) | `path, title, description, created_at, created_by` |
| `Exploration` | PushId (20-char sortable ID) | `topic_path, title, content, summary, depth, tags, price, gateway_url, content_hash, created_at, updated_at` |
| `User` | wallet address (e.g., `0xDEAD...`) | `address` |
| `TxLog` | PushId | `op, actor, target_id, target_type, timestamp` |
| `Snapshot` | PushId | `created_at, node_count, rel_count, tx_count` |

### Edge Types

| Type | From | To | Properties |
|------|------|----|-----------|
| `PARENT_OF` | Topic | Topic | (none) |
| `CREATED` | User | Exploration | (none) |
| `IN_TOPIC` | Exploration | Topic | (none) |
| `EXPLORED` | User | Topic | `count: number` |
| `BUILDS_ON` | Exploration | Exploration | (none) |
| `PAID_FOR` | User | Exploration | `amount, currency, tx_hash, accessed_at` |
| `INCLUDES` | Snapshot | TxLog | (none) |

---

## Testing Your Implementation

1. **Instantiate**: `const backend = new YourBackend(config);`
2. **Wire up**: `const kg = new KnowledgeGraph(backend, '0xYOUR_ADDRESS');`
3. **Populate**: Register 9 topics, write 17 explorations (use the TOPICS/PAPERS arrays from the benchmark)
4. **Verify correctness**: Compare results with MemoryBackend for:
   - `listTopics()` -- should return `['ai', 'ai/state-space-models']` (root topics only)
   - `getTopicStats('ai/transformers/decoder-only')` -- `{explorer_count: 1, max_depth: 3, avg_depth: 2.0}`
   - `getFrontierMap('ai/transformers')` -- 6 subtopics with correct stats
   - `getLineage(mistralId)` -- chain: Mistral -> LLaMA -> GPT-3 -> GPT-2 -> GPT-1 -> Transformer
   - `getTxLog()` -- exactly 26 entries (9 topics + 17 explorations)
   - `verifyIntegrity()` -- all 17 content hashes valid

---

## Reference Implementations

- **MemoryBackend** (`src/knowledge/memory-backend.ts`): Map/array based, 390 lines. Best starting point.
- **Neo4jBackend** (`src/knowledge/neo4j-backend.ts`): Cypher-based, 485 lines. Shows DB-specific patterns.
