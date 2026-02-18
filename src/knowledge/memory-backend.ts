/**
 * In-memory implementation of GraphBackend.
 *
 * Uses plain Maps and arrays — zero external dependencies.
 * Serves as the correctness baseline: if KnowledgeGraph produces the same
 * results on both MemoryBackend and Neo4jBackend, the abstraction is valid.
 */

import {
  GraphBackend,
  GraphNode,
  GraphEdge,
  GraphPath,
  AggregateResult,
  AggregateMetric,
} from './graph-backend';

export class MemoryBackend implements GraphBackend {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];
  /** Index: `out:${from}:${type}` → edges[], `in:${to}:${type}` → edges[] */
  private edgeIndex: Map<string, GraphEdge[]> = new Map();

  private nodeKey(label: string, id: string): string {
    return `${label}:${id}`;
  }

  private allNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  private findNodeById(id: string): GraphNode | null {
    const all = this.allNodes();
    for (let i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
    return null;
  }

  private indexEdge(edge: GraphEdge): void {
    const outKey = `out:${edge.from}:${edge.type}`;
    const inKey = `in:${edge.to}:${edge.type}`;
    if (!this.edgeIndex.has(outKey)) this.edgeIndex.set(outKey, []);
    if (!this.edgeIndex.has(inKey)) this.edgeIndex.set(inKey, []);
    this.edgeIndex.get(outKey)!.push(edge);
    this.edgeIndex.get(inKey)!.push(edge);
  }

  // --- Lifecycle ---

  async initialize(): Promise<void> {
    // No-op for in-memory backend.
  }

  // --- Transaction batching ---

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  async close(): Promise<void> {
    this.nodes.clear();
    this.edges = [];
    this.edgeIndex.clear();
  }

  // --- Write ---

  async createNode(node: GraphNode): Promise<void> {
    const key = this.nodeKey(node.label, node.id);
    this.nodes.set(key, { ...node });
  }

  async mergeNode(label: string, id: string, properties: Record<string, any>): Promise<void> {
    const key = this.nodeKey(label, id);
    const existing = this.nodes.get(key);
    if (existing) {
      existing.properties = { ...existing.properties, ...properties };
    } else {
      this.nodes.set(key, { label, id, properties: { ...properties } });
    }
  }

  async createEdge(edge: GraphEdge): Promise<void> {
    const copy: GraphEdge = { ...edge, properties: edge.properties ? { ...edge.properties } : undefined };
    this.edges.push(copy);
    this.indexEdge(copy);
  }

  async mergeEdge(edge: GraphEdge): Promise<void> {
    const existing = this.edges.find(
      (e) => e.type === edge.type && e.from === edge.from && e.to === edge.to
    );
    if (existing) {
      if (edge.properties) {
        existing.properties = { ...existing.properties, ...edge.properties };
      }
    } else {
      await this.createEdge(edge);
    }
  }

  async incrementEdgeProperty(
    type: string,
    from: string,
    to: string,
    property: string,
    delta: number
  ): Promise<void> {
    let existing = this.edges.find(
      (e) => e.type === type && e.from === from && e.to === to
    );
    if (!existing) {
      existing = { type, from, to, properties: { [property]: 0 } };
      this.edges.push(existing);
      this.indexEdge(existing);
    }
    if (!existing.properties) existing.properties = {};
    existing.properties[property] = (existing.properties[property] || 0) + delta;
  }

  // --- Read ---

  async getNode(label: string, id: string): Promise<GraphNode | null> {
    return this.nodes.get(this.nodeKey(label, id)) || null;
  }

  async findNodes(label: string, filter?: Record<string, any>): Promise<GraphNode[]> {
    const results: GraphNode[] = [];
    const all = this.allNodes();
    for (let i = 0; i < all.length; i++) {
      const node = all[i];
      if (node.label !== label) continue;
      if (filter) {
        let match = true;
        const keys = Object.keys(filter);
        for (let j = 0; j < keys.length; j++) {
          if (node.properties[keys[j]] !== filter[keys[j]]) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }
      results.push(node);
    }
    return results;
  }

  async getChildren(
    parentLabel: string,
    parentId: string,
    edgeType: string,
    childLabel: string
  ): Promise<GraphNode[]> {
    const outKey = `out:${parentId}:${edgeType}`;
    const edges = this.edgeIndex.get(outKey) || [];
    const children: GraphNode[] = [];
    for (let i = 0; i < edges.length; i++) {
      const child = this.nodes.get(this.nodeKey(childLabel, edges[i].to));
      if (child) children.push(child);
    }
    return children;
  }

  async getRoots(label: string, incomingEdgeType: string): Promise<GraphNode[]> {
    const hasIncoming = new Set<string>();
    for (let i = 0; i < this.edges.length; i++) {
      if (this.edges[i].type === incomingEdgeType) {
        hasIncoming.add(this.edges[i].to);
      }
    }

    const roots: GraphNode[] = [];
    const all = this.allNodes();
    for (let i = 0; i < all.length; i++) {
      if (all[i].label === label && !hasIncoming.has(all[i].id)) {
        roots.push(all[i]);
      }
    }
    return roots;
  }

  async getEdges(nodeId: string, edgeType: string, direction: 'in' | 'out'): Promise<GraphEdge[]> {
    const key = `${direction}:${nodeId}:${edgeType}`;
    return this.edgeIndex.get(key) || [];
  }

  // --- Aggregation ---

  async aggregateOverEdge(
    targetLabel: string,
    targetId: string,
    edgeType: string,
    sourceLabel: string,
    metrics: AggregateMetric[]
  ): Promise<Record<string, number>> {
    const inKey = `in:${targetId}:${edgeType}`;
    const edges = this.edgeIndex.get(inKey) || [];

    const sourceNodes: GraphNode[] = [];
    for (let i = 0; i < edges.length; i++) {
      const node = this.nodes.get(this.nodeKey(sourceLabel, edges[i].from));
      if (node) sourceNodes.push(node);
    }

    // Collect all exploration depths for this topic
    const allDepths: number[] = [];
    const inTopicKey = `in:${targetId}:IN_TOPIC`;
    const inTopicEdges = this.edgeIndex.get(inTopicKey) || [];
    for (let i = 0; i < inTopicEdges.length; i++) {
      const expNode = this.nodes.get(this.nodeKey('Exploration', inTopicEdges[i].from));
      if (expNode && typeof expNode.properties.depth === 'number') {
        allDepths.push(expNode.properties.depth);
      }
    }

    const result: Record<string, number> = {};
    for (let i = 0; i < metrics.length; i++) {
      const metric = metrics[i];
      if (metric.fn === 'count') {
        result[metric.property] = sourceNodes.length;
      } else if (metric.fn === 'max') {
        result[metric.property] = allDepths.length > 0 ? Math.max.apply(null, allDepths) : 0;
      } else if (metric.fn === 'avg') {
        result[metric.property] =
          allDepths.length > 0
            ? Math.round((allDepths.reduce(function(a, b) { return a + b; }, 0) / allDepths.length) * 100) / 100
            : 0;
      } else if (metric.fn === 'sum') {
        result[metric.property] = allDepths.reduce(function(a, b) { return a + b; }, 0);
      }
    }
    return result;
  }

  async aggregateGrouped(
    parentLabel: string,
    parentId: string,
    parentToChildEdge: string,
    childLabel: string,
    childToLeafEdge: string,
    leafLabel: string,
    metrics: AggregateMetric[]
  ): Promise<AggregateResult[]> {
    const children = await this.getChildren(parentLabel, parentId, parentToChildEdge, childLabel);
    const results: AggregateResult[] = [];

    for (let ci = 0; ci < children.length; ci++) {
      const child = children[ci];

      // Find all users who EXPLORED this child topic
      const exploredInKey = `in:${child.id}:EXPLORED`;
      const exploredEdges = this.edgeIndex.get(exploredInKey) || [];
      const explorerCount = exploredEdges.length;

      // Find all exploration depths for this child topic
      const inTopicKey = `in:${child.id}:IN_TOPIC`;
      const inTopicEdges = this.edgeIndex.get(inTopicKey) || [];
      const depths: number[] = [];
      for (let i = 0; i < inTopicEdges.length; i++) {
        const exp = this.nodes.get(this.nodeKey('Exploration', inTopicEdges[i].from));
        if (exp && typeof exp.properties.depth === 'number') {
          depths.push(exp.properties.depth);
        }
      }

      const values: Record<string, number> = {};
      for (let i = 0; i < metrics.length; i++) {
        const metric = metrics[i];
        if (metric.fn === 'count_distinct') {
          values[metric.property] = explorerCount;
        } else if (metric.fn === 'max') {
          values[metric.property] = depths.length > 0 ? Math.max.apply(null, depths) : 0;
        } else if (metric.fn === 'avg') {
          values[metric.property] =
            depths.length > 0
              ? Math.round((depths.reduce(function(a, b) { return a + b; }, 0) / depths.length) * 100) / 100
              : 0;
        }
      }

      results.push({ group: child.id, values });
    }

    return results;
  }

  // --- Graph traversal ---

  async traverse(
    startId: string,
    edgeType: string,
    direction: 'in' | 'out',
    maxDepth?: number
  ): Promise<GraphPath[]> {
    const self = this;
    const paths: GraphPath[] = [];
    const visited = new Set<string>();

    const dfs = function(currentId: string, currentPath: GraphPath, depth: number) {
      if (maxDepth !== undefined && depth >= maxDepth) return;

      const key = direction === 'out' ? `out:${currentId}:${edgeType}` : `in:${currentId}:${edgeType}`;
      const edges = self.edgeIndex.get(key) || [];

      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const nextId = direction === 'out' ? edge.to : edge.from;
        if (visited.has(nextId)) continue;

        visited.add(nextId);

        const nextNode = self.findNodeById(nextId);
        if (!nextNode) continue;

        const newPath: GraphPath = {
          nodes: currentPath.nodes.concat([nextNode]),
          edges: currentPath.edges.concat([edge]),
        };

        paths.push(newPath);
        dfs(nextId, newPath, depth + 1);
      }
    };

    const startNode = this.findNodeById(startId);
    if (!startNode) return [];

    visited.add(startId);
    const initialPath: GraphPath = { nodes: [startNode], edges: [] };
    dfs(startId, initialPath, 0);

    return paths;
  }

  async shortestPath(
    fromId: string,
    toId: string,
    edgeType: string
  ): Promise<GraphPath | null> {
    const fromNode = this.findNodeById(fromId);
    if (!fromNode) return null;

    const visited = new Set<string>([fromId]);
    const queue: Array<{ nodeId: string; path: GraphPath }> = [
      { nodeId: fromId, path: { nodes: [fromNode], edges: [] } },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const nodeId = current.nodeId;
      const path = current.path;

      const outEdges = this.edgeIndex.get(`out:${nodeId}:${edgeType}`) || [];
      const inEdges = this.edgeIndex.get(`in:${nodeId}:${edgeType}`) || [];
      const allEdges = outEdges.concat(inEdges);

      for (let i = 0; i < allEdges.length; i++) {
        const edge = allEdges[i];
        const nextId = edge.from === nodeId ? edge.to : edge.from;
        if (visited.has(nextId)) continue;

        visited.add(nextId);

        const nextNode = this.findNodeById(nextId);
        if (!nextNode) continue;

        const newPath: GraphPath = {
          nodes: path.nodes.concat([nextNode]),
          edges: path.edges.concat([edge]),
        };

        if (nextId === toId) return newPath;
        queue.push({ nodeId: nextId, path: newPath });
      }
    }

    return null;
  }

  // --- Ledger ---

  async nodeCount(label?: string): Promise<number> {
    if (!label) return this.nodes.size;
    let count = 0;
    const all = this.allNodes();
    for (let i = 0; i < all.length; i++) {
      if (all[i].label === label) count++;
    }
    return count;
  }

  async edgeCount(type?: string): Promise<number> {
    if (!type) return this.edges.length;
    return this.edges.filter(function(e) { return e.type === type; }).length;
  }
}
