/**
 * Abstract graph storage contract for the Knowledge module.
 *
 * Any graph database (Neo4j, Memgraph, ArangoDB, or plain in-memory maps)
 * can back a KnowledgeGraph instance by implementing this interface.
 */

/** A node in the graph. */
export interface GraphNode {
  label: string;
  id: string;
  properties: Record<string, any>;
}

/** A directed edge between two nodes. */
export interface GraphEdge {
  type: string;
  from: string;
  to: string;
  properties?: Record<string, any>;
}

/** Result of an aggregation query. */
export interface AggregateResult {
  group: string;
  values: Record<string, number>;
}

/** A traversal path through the graph. */
export interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Metric specification for aggregation queries. */
export interface AggregateMetric {
  property: string;
  fn: 'count' | 'count_distinct' | 'max' | 'avg' | 'sum';
}

export interface GraphBackend {
  // --- Lifecycle ---
  initialize(): Promise<void>;
  close(): Promise<void>;

  // --- Write (append-only) ---
  createNode(node: GraphNode): Promise<void>;
  mergeNode(label: string, id: string, properties: Record<string, any>): Promise<void>;
  createEdge(edge: GraphEdge): Promise<void>;
  mergeEdge(edge: GraphEdge): Promise<void>;
  incrementEdgeProperty(
    type: string,
    from: string,
    to: string,
    property: string,
    delta: number
  ): Promise<void>;

  // --- Read ---
  getNode(label: string, id: string): Promise<GraphNode | null>;
  findNodes(label: string, filter?: Record<string, any>): Promise<GraphNode[]>;
  getChildren(
    parentLabel: string,
    parentId: string,
    edgeType: string,
    childLabel: string
  ): Promise<GraphNode[]>;
  getRoots(label: string, incomingEdgeType: string): Promise<GraphNode[]>;
  getEdges(nodeId: string, edgeType: string, direction: 'in' | 'out'): Promise<GraphEdge[]>;

  // --- Aggregation ---
  aggregateOverEdge(
    targetLabel: string,
    targetId: string,
    edgeType: string,
    sourceLabel: string,
    metrics: AggregateMetric[]
  ): Promise<Record<string, number>>;

  aggregateGrouped(
    parentLabel: string,
    parentId: string,
    parentToChildEdge: string,
    childLabel: string,
    childToLeafEdge: string,
    leafLabel: string,
    metrics: AggregateMetric[]
  ): Promise<AggregateResult[]>;

  // --- Graph traversal ---
  traverse(
    startId: string,
    edgeType: string,
    direction: 'in' | 'out',
    maxDepth?: number
  ): Promise<GraphPath[]>;
  shortestPath(
    fromId: string,
    toId: string,
    edgeType: string
  ): Promise<GraphPath | null>;

  // --- Ledger ---
  nodeCount(label?: string): Promise<number>;
  edgeCount(type?: string): Promise<number>;
}
