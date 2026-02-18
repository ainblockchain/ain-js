# AIN Blockchain Knowledge Module — Interface for Parallel Implementation

This document defines the on-chain data model and API contract for the Knowledge module on AIN blockchain. Use this to implement blockchain-side changes (rule functions, indexing, state management) in parallel with the ain-js client work.

---

## On-Chain State Tree Structure

```
/apps/knowledge/
|-- explorations/
|   +-- {userAddress}/
|       +-- {topicKey}/                    # topicKey = topicPath with '/' replaced by '|'
|           +-- {entryId}                  # PushId -> Exploration object
|-- topics/
|   +-- {topicPath}/                       # nested: ai/transformers/attention
|       +-- .info                          # -> TopicInfo object
|       +-- {subtopicName}/               # recursive nesting
|-- index/by_topic/
|   +-- {topicKey}/
|       +-- explorers/
|           +-- {userAddress}              # -> count (number)
+-- access/
    +-- {buyerAddress}/
        +-- {entryKey}                     # -> AccessReceipt object
```

### Topic Key Encoding

Topic paths use `/` as separator (e.g., `ai/transformers/attention`), but the blockchain state tree uses `|` as separator for flat storage under `explorations/` and `index/by_topic/`:

```
topicPathToKey("ai/transformers/attention") -> "ai|transformers|attention"
topicKeyToPath("ai|transformers|attention") -> "ai/transformers/attention"
```

---

## Data Types

### TopicInfo

Stored at `/apps/knowledge/topics/{topicPath}/.info`

```typescript
interface TopicInfo {
  title: string;        // Human-readable title
  description: string;  // Description of the topic
  created_at: number;   // Unix timestamp (ms)
  created_by: string;   // Creator's wallet address
}
```

### Exploration

Stored at `/apps/knowledge/explorations/{address}/{topicKey}/{entryId}`

```typescript
interface Exploration {
  topic_path: string;           // e.g., "ai/transformers/decoder-only"
  title: string;                // Title of the exploration
  content: string | null;       // Full content (null if gated/paid)
  summary: string;              // Short summary
  depth: 1 | 2 | 3 | 4 | 5;   // Exploration depth level
  tags: string;                 // Comma-separated tags, includes "builds-on:{parentId}" for lineage
  price: string | null;         // null for free, amount string for paid
  gateway_url: string | null;   // null for free, x402 gateway URL for paid content
  content_hash: string | null;  // SHA-256 hash of content (always present in graph backends)
  created_at: number;           // Unix timestamp (ms)
  updated_at: number;           // Unix timestamp (ms)
}
```

### AccessReceipt

Stored at `/apps/knowledge/access/{buyerAddress}/{entryKey}`

```typescript
interface AccessReceipt {
  seller: string;        // Content creator's address
  topic_path: string;    // Topic path
  entry_id: string;      // Exploration entry PushId
  amount: string;        // Payment amount
  currency: string;      // e.g., 'USDC'
  tx_hash: string;       // Payment transaction hash
  accessed_at: number;   // Unix timestamp (ms)
}
```

---

## API Methods (ain-js client side)

### Write Operations

#### `registerTopic(topicPath, {title, description}, options?)`

**State writes**:
- SET_VALUE at `/apps/knowledge/topics/{topicPath}/.info` -> TopicInfo

#### `explore(input, options?)`

**State writes** (atomic multi-op transaction):
1. SET_VALUE at `/apps/knowledge/explorations/{address}/{topicKey}/{entryId}` -> Exploration
2. SET_VALUE at `/apps/knowledge/index/by_topic/{topicKey}/explorers/{address}` -> count + 1

**Content hashing**: If `price` and `gatewayUrl` are set, content is gated:
- `content` field is set to `null`
- `content_hash` is set to SHA-256 of the original content
- Content is stored off-chain behind the x402 gateway

#### `setupApp(options?)`

One-time app registration:
1. Register app via `/manage_app/knowledge/create/{timestamp}`
2. Set owner permissions on `/apps/knowledge`
3. Set write rules:
   - `/apps/knowledge/explorations/$user_addr` -> `auth.addr === $user_addr`
   - `/apps/knowledge/topics` -> `auth.addr !== ''`
   - `/apps/knowledge/index/by_topic/$topic_key/explorers/$user_addr` -> `auth.addr === $user_addr`
   - `/apps/knowledge/access/$buyer_addr` -> `auth.addr === $buyer_addr`

### Read Operations

#### `listTopics(): string[]`

GET_VALUE at `/apps/knowledge/topics` -> `Object.keys(data)`

#### `listSubtopics(topicPath): string[]`

GET_VALUE at `/apps/knowledge/topics/{topicPath}` -> `Object.keys(data).filter(k => k !== '.info')`

#### `getTopicInfo(topicPath): TopicInfo | null`

GET_VALUE at `/apps/knowledge/topics/{topicPath}/.info`

#### `getExplorations(address, topicPath): Record<string, Exploration> | null`

GET_VALUE at `/apps/knowledge/explorations/{address}/{topicKey}`

#### `getExplorationsByUser(address): Record<string, Record<string, Exploration>> | null`

GET_VALUE at `/apps/knowledge/explorations/{address}`

#### `getExplorers(topicPath): string[]`

GET_VALUE at `/apps/knowledge/index/by_topic/{topicKey}/explorers` -> `Object.keys(data)`

#### `getTopicStats(topicPath): TopicStats`

```typescript
interface TopicStats {
  explorer_count: number;  // Number of unique explorers
  max_depth: number;       // Maximum depth across all explorations
  avg_depth: number;       // Average depth (rounded to 2 decimals)
}
```

**Current implementation** (N+1 problem):
1. GET explorers list
2. For each explorer, GET their explorations for this topic
3. Collect all depths, compute max/avg

**Desired**: Single indexed query.

#### `getFrontierMap(topicPath?): FrontierMapEntry[]`

```typescript
interface FrontierMapEntry {
  topic: string;        // Subtopic path
  stats: TopicStats;    // Stats for this subtopic
}
```

**Current implementation** (K x N+1 problem):
1. List subtopics
2. For each subtopic, call getTopicStats()

**Desired**: Single aggregation query across all subtopics.

#### `access(ownerAddress, topicPath, entryId, options?): AccessResult`

```typescript
interface AccessResult {
  content: string;            // Full content
  paid: boolean;              // Whether payment was required
  receipt?: AccessReceipt;    // Payment receipt (if paid)
}
```

1. GET exploration at `/apps/knowledge/explorations/{owner}/{topicKey}/{entryId}`
2. If free (no price/gateway): return content directly
3. If gated: use x402 client to pay and fetch content, verify content_hash, store AccessReceipt

---

## Known Performance Issues on Blockchain

| Issue | Root Cause | Impact |
|-------|-----------|--------|
| Write latency | 10s block time per write | 26 writes = ~4.5 minutes for 17-paper graph |
| N+1 queries in getTopicStats | Iterates all explorers x their explorations | O(E*N) network calls |
| K*N*M queries in getFrontierMap | Calls getTopicStats for each subtopic | Compounds the N+1 problem |
| No graph traversal | builds-on tags must be parsed client-side | Must fetch ALL entries to reconstruct lineage |
| Missing state entries | Some topics vanish from state tree | `attention` and `encoder-only` observed missing |

---

## Graph Backend Equivalence

The graph backends (MemoryBackend, Neo4jBackend) produce identical results for these shared operations:

| Blockchain API | Graph Backend equivalent |
|---------------|------------------------|
| `listTopics()` | `getRoots('Topic', 'PARENT_OF')` -> map to ids |
| `listSubtopics(path)` | `getChildren('Topic', path, 'PARENT_OF', 'Topic')` -> map to ids |
| `getTopicInfo(path)` | `getNode('Topic', path)` -> extract properties |
| `getExplorations(addr, path)` | `getEdges(addr, 'CREATED', 'out')` -> filter by topic_path |
| `getExplorers(path)` | `getEdges(path, 'EXPLORED', 'in')` -> map to from ids |
| `getTopicStats(path)` | `aggregateOverEdge('Topic', path, 'EXPLORED', 'User', metrics)` |
| `getFrontierMap(path)` | `aggregateGrouped('Topic', path, 'PARENT_OF', 'Topic', ...)` |

Graph backends additionally support:
- `getLineage(id)` -- ancestor chain via BUILDS_ON traversal
- `getDescendants(id)` -- downstream explorations
- `shortestPath(from, to)` -- shortest BUILDS_ON path
- `takeSnapshot()` -- point-in-time checkpoint
- `verifyIntegrity()` -- content hash verification
- `getTxLog()` -- audit trail

---

## Tags Convention

Tags are stored as a comma-separated string in the `tags` field of Exploration:

```
"decoder-only,autoregressive,sliding-window-attention,grouped-query-attention,builds-on:llama"
```

- Regular tags: architecture/concept labels
- Lineage tags: `builds-on:{parentPaperId}` -- establish the BUILDS_ON graph edges

The graph backends parse these tags during `explore()` and create explicit `BUILDS_ON` edges between Exploration nodes.

---

## Test Data: 9 Topics, 17 Papers

### Topics (register in this order -- parent first)

| # | Path | Title |
|---|------|-------|
| 1 | `ai` | Artificial Intelligence |
| 2 | `ai/transformers` | Transformers |
| 3 | `ai/transformers/attention` | Attention Mechanisms |
| 4 | `ai/transformers/encoder-only` | Encoder-Only Models |
| 5 | `ai/transformers/decoder-only` | Decoder-Only Models |
| 6 | `ai/transformers/encoder-decoder` | Encoder-Decoder Models |
| 7 | `ai/transformers/vision` | Vision Transformers |
| 8 | `ai/transformers/diffusion` | Diffusion Models |
| 9 | `ai/state-space-models` | State-Space Models |

### Papers (17 explorations)

| Paper | Topic | Depth | Builds On |
|-------|-------|-------|-----------|
| Transformer (2017) | attention | 3 | (root) |
| GPT-1 (2018) | decoder-only | 3 | transformer |
| BERT (2018) | encoder-only | 3 | transformer |
| Transformer-XL (2019) | decoder-only | 2 | transformer |
| GPT-2 (2019) | decoder-only | 2 | gpt1 |
| RoBERTa (2019) | encoder-only | 2 | bert |
| XLNet (2019) | encoder-only | 2 | bert, transformer-xl |
| ALBERT (2019) | encoder-only | 2 | bert |
| T5 (2019) | encoder-decoder | 2 | transformer |
| ViT (2020) | vision | 2 | transformer |
| DeBERTa (2020) | encoder-only | 1 | bert |
| GPT-3 (2020) | decoder-only | 2 | gpt2 |
| CLIP (2021) | vision | 1 | vit |
| Stable Diffusion (2022) | diffusion | 1 | clip |
| LLaMA (2023) | decoder-only | 1 | gpt3 |
| Mistral (2023) | decoder-only | 1 | llama |
| Mamba (2023) | state-space-models | 1 | (root) |

### Expected Stats

| Topic | Explorer Count | Max Depth | Avg Depth |
|-------|---------------|-----------|-----------|
| `ai/transformers/attention` | 1 | 3 | 3.0 |
| `ai/transformers/encoder-only` | 1 | 3 | 2.0 |
| `ai/transformers/decoder-only` | 1 | 3 | 2.0 |
| `ai/transformers/encoder-decoder` | 1 | 2 | 2.0 |
| `ai/transformers/vision` | 1 | 2 | 1.5 |
| `ai/transformers/diffusion` | 1 | 1 | 1.0 |
| `ai/state-space-models` | 1 | 1 | 1.0 |

### Expected TxLog

26 entries total: 9 `registerTopic` + 17 `explore` operations.

### Expected Lineage: Mistral -> Transformer

```
Mistral -> LLaMA -> GPT-3 -> GPT-2 -> GPT-1 -> Transformer
```

(6 nodes, 5 BUILDS_ON edges)
