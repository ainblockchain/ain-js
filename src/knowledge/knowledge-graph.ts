/**
 * High-level domain API for Knowledge graph operations.
 *
 * Delegates to any GraphBackend implementation. Handles content hashing,
 * PushId generation, TxLog writing, and snapshot logic — all backend-agnostic.
 */

import { PushId } from '../ain-db/push-id';
import {
  GraphBackend,
  GraphNode,
  GraphEdge,
} from './graph-backend';
import {
  TopicInfo,
  Exploration,
  ExploreInput,
  TopicStats,
  FrontierMapEntry,
  AccessResult,
} from './types';

/**
 * Computes a SHA-256 hash of the given content string.
 */
async function hashContent(content: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js fallback
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}

export class KnowledgeGraph {
  private backend: GraphBackend;
  private address: string;

  constructor(backend: GraphBackend, address: string) {
    this.backend = backend;
    this.address = address;
  }

  // ---------------------------------------------------------------------------
  // Write (all create TxLog entries)
  // ---------------------------------------------------------------------------

  /**
   * Register a topic in the graph.
   * Creates a Topic node, parent edges (if nested), and a TxLog entry.
   */
  async registerTopic(
    topicPath: string,
    info: { title: string; description: string }
  ): Promise<void> {
    const now = Date.now();
    const topicProps = {
      path: topicPath,
      title: info.title,
      description: info.description,
      created_at: now,
      created_by: this.address,
    };

    await this.backend.mergeNode('Topic', topicPath, topicProps);

    // If the topic has a parent, create the PARENT_OF edge
    const parts = topicPath.split('/');
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join('/');
      await this.backend.mergeEdge({
        type: 'PARENT_OF',
        from: parentPath,
        to: topicPath,
      });
    }

    // TxLog
    const txId = PushId.generate();
    await this.backend.createNode({
      label: 'TxLog',
      id: txId,
      properties: {
        op: 'registerTopic',
        actor: this.address,
        target_id: topicPath,
        target_type: 'Topic',
        timestamp: now,
      },
    });
  }

  /**
   * Record an exploration entry.
   * Creates Exploration node, User node, edges, and a TxLog entry.
   * Returns the exploration id.
   */
  async explore(input: ExploreInput): Promise<string> {
    const now = Date.now();
    const entryId = PushId.generate();
    const isGated = !!input.price && !!input.gatewayUrl;
    const contentHash = await hashContent(input.content);

    const exploration: Exploration = {
      topic_path: input.topicPath,
      title: input.title,
      content: isGated ? null : input.content,
      summary: input.summary,
      depth: input.depth,
      tags: input.tags,
      price: input.price || null,
      gateway_url: input.gatewayUrl || null,
      content_hash: contentHash,
      created_at: now,
      updated_at: now,
    };

    // Merge User node (idempotent)
    await this.backend.mergeNode('User', this.address, { address: this.address });

    // Create Exploration node (append-only: always new)
    await this.backend.createNode({
      label: 'Exploration',
      id: entryId,
      properties: { ...exploration },
    });

    // Edges: CREATED, IN_TOPIC, EXPLORED (with count increment)
    await this.backend.createEdge({
      type: 'CREATED',
      from: this.address,
      to: entryId,
    });

    await this.backend.createEdge({
      type: 'IN_TOPIC',
      from: entryId,
      to: input.topicPath,
    });

    await this.backend.incrementEdgeProperty(
      'EXPLORED',
      this.address,
      input.topicPath,
      'count',
      1
    );

    // Parse builds-on tags and create BUILDS_ON edges
    const tags = input.tags.split(',').map((t) => t.trim());
    for (const tag of tags) {
      if (tag.startsWith('builds-on:')) {
        const parentId = tag.slice('builds-on:'.length);
        await this.backend.createEdge({
          type: 'BUILDS_ON',
          from: entryId,
          to: parentId,
        });
      }
    }

    // TxLog
    const txId = PushId.generate();
    await this.backend.createNode({
      label: 'TxLog',
      id: txId,
      properties: {
        op: 'explore',
        actor: this.address,
        target_id: entryId,
        target_type: 'Exploration',
        timestamp: now,
      },
    });

    return entryId;
  }

  // ---------------------------------------------------------------------------
  // Read (matching blockchain Knowledge API)
  // ---------------------------------------------------------------------------

  /** List all top-level topic paths. */
  async listTopics(): Promise<string[]> {
    const roots = await this.backend.getRoots('Topic', 'PARENT_OF');
    return roots.map((n) => n.id).sort();
  }

  /** List subtopic paths under a given topic. */
  async listSubtopics(topicPath: string): Promise<string[]> {
    const children = await this.backend.getChildren('Topic', topicPath, 'PARENT_OF', 'Topic');
    return children.map((n) => n.id).sort();
  }

  /** Get metadata for a specific topic. */
  async getTopicInfo(topicPath: string): Promise<TopicInfo | null> {
    const node = await this.backend.getNode('Topic', topicPath);
    if (!node) return null;
    return {
      title: node.properties.title,
      description: node.properties.description,
      created_at: node.properties.created_at,
      created_by: node.properties.created_by,
    };
  }

  /** Get all explorations by a user for a specific topic. */
  async getExplorations(
    address: string,
    topicPath: string
  ): Promise<Record<string, Exploration> | null> {
    // Find explorations: User -[CREATED]-> Exploration -[IN_TOPIC]-> Topic
    const createdEdges = await this.backend.getEdges(address, 'CREATED', 'out');
    if (createdEdges.length === 0) return null;

    const result: Record<string, Exploration> = {};
    for (const edge of createdEdges) {
      const expNode = await this.backend.getNode('Exploration', edge.to);
      if (!expNode) continue;
      if (expNode.properties.topic_path !== topicPath) continue;
      result[edge.to] = this.nodeToExploration(expNode);
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  /** Get all explorations by a user across all topics. */
  async getExplorationsByUser(
    address: string
  ): Promise<Record<string, Record<string, Exploration>> | null> {
    const createdEdges = await this.backend.getEdges(address, 'CREATED', 'out');
    if (createdEdges.length === 0) return null;

    const result: Record<string, Record<string, Exploration>> = {};
    for (const edge of createdEdges) {
      const expNode = await this.backend.getNode('Exploration', edge.to);
      if (!expNode) continue;
      const topicPath = expNode.properties.topic_path;
      const topicKey = topicPath.replace(/\//g, '|');
      if (!result[topicKey]) result[topicKey] = {};
      result[topicKey][edge.to] = this.nodeToExploration(expNode);
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  /** Get explorers for a topic. */
  async getExplorers(topicPath: string): Promise<string[]> {
    const edges = await this.backend.getEdges(topicPath, 'EXPLORED', 'in');
    return edges.map((e) => e.from);
  }

  /** Get statistics for a topic (explorer count, max depth, average depth). */
  async getTopicStats(topicPath: string): Promise<TopicStats> {
    const result = await this.backend.aggregateOverEdge(
      'Topic',
      topicPath,
      'EXPLORED',
      'User',
      [
        { property: 'explorer_count', fn: 'count' },
        { property: 'max_depth', fn: 'max' },
        { property: 'avg_depth', fn: 'avg' },
      ]
    );

    return {
      explorer_count: result.explorer_count || 0,
      max_depth: result.max_depth || 0,
      avg_depth: result.avg_depth || 0,
    };
  }

  /** Get frontier map: stats per subtopic. */
  async getFrontierMap(topicPath?: string): Promise<FrontierMapEntry[]> {
    if (topicPath) {
      const results = await this.backend.aggregateGrouped(
        'Topic',
        topicPath,
        'PARENT_OF',
        'Topic',
        'IN_TOPIC',
        'Exploration',
        [
          { property: 'explorer_count', fn: 'count_distinct' },
          { property: 'max_depth', fn: 'max' },
          { property: 'avg_depth', fn: 'avg' },
        ]
      );

      return results.map((r) => ({
        topic: r.group,
        stats: {
          explorer_count: r.values.explorer_count || 0,
          max_depth: r.values.max_depth || 0,
          avg_depth: r.values.avg_depth || 0,
        },
      }));
    }

    // No parent specified: get stats for all root topics
    const roots = await this.listTopics();
    const entries: FrontierMapEntry[] = [];
    for (const root of roots) {
      const stats = await this.getTopicStats(root);
      entries.push({ topic: root, stats });
    }
    return entries;
  }

  /** Access an exploration entry. Returns content directly (no x402 in graph backends). */
  async access(
    ownerAddress: string,
    topicPath: string,
    entryId: string
  ): Promise<AccessResult> {
    const expNode = await this.backend.getNode('Exploration', entryId);
    if (!expNode) {
      throw new Error(`Exploration not found: ${entryId}`);
    }

    // Record access as PAID_FOR edge
    const now = Date.now();
    await this.backend.mergeEdge({
      type: 'PAID_FOR',
      from: this.address,
      to: entryId,
      properties: {
        amount: '0',
        currency: 'FREE',
        tx_hash: '',
        accessed_at: now,
      },
    });

    return {
      content: expNode.properties.content || '',
      paid: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Graph-native queries
  // ---------------------------------------------------------------------------

  /** Get the ancestor chain of an exploration (via BUILDS_ON edges). */
  async getLineage(explorationId: string): Promise<Exploration[]> {
    const paths = await this.backend.traverse(explorationId, 'BUILDS_ON', 'out');
    if (paths.length === 0) return [];

    // Get the longest path (deepest lineage)
    const longest = paths.reduce((a, b) => (a.nodes.length > b.nodes.length ? a : b));
    return longest.nodes
      .filter((n) => n.label === 'Exploration')
      .map((n) => this.nodeToExploration(n));
  }

  /** Get all descendants of an exploration (via BUILDS_ON edges, reversed). */
  async getDescendants(explorationId: string): Promise<Exploration[]> {
    const paths = await this.backend.traverse(explorationId, 'BUILDS_ON', 'in');
    const seen = new Set<string>();
    const results: Exploration[] = [];

    for (const path of paths) {
      for (const node of path.nodes) {
        if (node.label === 'Exploration' && node.id !== explorationId && !seen.has(node.id)) {
          seen.add(node.id);
          results.push(this.nodeToExploration(node));
        }
      }
    }
    return results;
  }

  /** Get shortest path between two explorations. */
  async getShortestPath(fromId: string, toId: string): Promise<Exploration[]> {
    const path = await this.backend.shortestPath(fromId, toId, 'BUILDS_ON');
    if (!path) return [];
    return path.nodes
      .filter((n) => n.label === 'Exploration')
      .map((n) => this.nodeToExploration(n));
  }

  // ---------------------------------------------------------------------------
  // Ledger operations
  // ---------------------------------------------------------------------------

  /**
   * Take a snapshot of the current graph state.
   * Creates a Snapshot node linking to all TxLog entries created so far.
   */
  async takeSnapshot(): Promise<{
    id: string;
    node_count: number;
    rel_count: number;
    tx_count: number;
  }> {
    const now = Date.now();
    const snapshotId = PushId.generate();

    const nodeCount = await this.backend.nodeCount();
    const relCount = await this.backend.edgeCount();
    const txLogs = await this.backend.findNodes('TxLog');
    const txCount = txLogs.length;

    await this.backend.createNode({
      label: 'Snapshot',
      id: snapshotId,
      properties: {
        created_at: now,
        node_count: nodeCount,
        rel_count: relCount,
        tx_count: txCount,
      },
    });

    // Link snapshot to all TxLog entries
    for (const tx of txLogs) {
      await this.backend.createEdge({
        type: 'INCLUDES',
        from: snapshotId,
        to: tx.id,
      });
    }

    return { id: snapshotId, node_count: nodeCount, rel_count: relCount, tx_count: txCount };
  }

  /** Get all snapshots. */
  async getSnapshots(): Promise<GraphNode[]> {
    return this.backend.findNodes('Snapshot');
  }

  /** Get TxLog entries, optionally filtered by timestamp and limited. */
  async getTxLog(since?: number, limit?: number): Promise<GraphNode[]> {
    const allTx = await this.backend.findNodes('TxLog');

    let filtered = allTx;
    if (since !== undefined) {
      filtered = filtered.filter((tx) => tx.properties.timestamp >= since);
    }

    // Sort by timestamp ascending
    filtered.sort((a, b) => a.properties.timestamp - b.properties.timestamp);

    if (limit !== undefined) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }

  /**
   * Verify integrity of all exploration content hashes.
   * Returns total count, valid count, and list of invalid exploration ids.
   */
  async verifyIntegrity(): Promise<{
    total: number;
    valid: number;
    invalid: string[];
  }> {
    const explorations = await this.backend.findNodes('Exploration');
    let valid = 0;
    const invalid: string[] = [];

    for (const exp of explorations) {
      if (!exp.properties.content_hash) {
        // No hash to verify (shouldn't happen with our implementation)
        valid++;
        continue;
      }

      if (exp.properties.content) {
        const computed = await hashContent(exp.properties.content);
        if (computed === exp.properties.content_hash) {
          valid++;
        } else {
          invalid.push(exp.id);
        }
      } else {
        // Gated content — content is null, hash was computed at write time
        // We can't verify without the original content, count as valid
        valid++;
      }
    }

    return { total: explorations.length, valid, invalid };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private nodeToExploration(node: GraphNode): Exploration {
    const p = node.properties;
    return {
      topic_path: p.topic_path,
      title: p.title,
      content: p.content || null,
      summary: p.summary,
      depth: p.depth,
      tags: p.tags,
      price: p.price || null,
      gateway_url: p.gateway_url || null,
      content_hash: p.content_hash || null,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  }
}
