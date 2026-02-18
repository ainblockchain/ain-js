/**
 * Neo4j implementation of GraphBackend.
 *
 * Translates graph-backend interface calls into Cypher queries over bolt://.
 * Requires `neo4j-driver` package and a running Neo4j instance.
 *
 * Supports transaction batching via `withTransaction()`: when active, all
 * queries share a single session/transaction instead of opening one per call.
 */

import neo4j, { Driver, Session, Transaction, Record as Neo4jRecord } from 'neo4j-driver';
import {
  GraphBackend,
  GraphNode,
  GraphEdge,
  GraphPath,
  AggregateResult,
  AggregateMetric,
} from './graph-backend';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
}

interface QueryRunner {
  run(query: string, params?: Record<string, any>): Promise<{ records: any[] }>;
}

export class Neo4jBackend implements GraphBackend {
  private driver: Driver;
  private _activeTx: { session: Session; tx: Transaction } | null = null;

  constructor(config: Neo4jConfig) {
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password)
    );
  }

  /**
   * Run a Cypher query. If inside a `withTransaction()` block, reuses the
   * active transaction. Otherwise opens a standalone session for the query.
   */
  private async runQuery(
    query: string,
    params?: Record<string, any>
  ): Promise<{ records: any[] }> {
    if (this._activeTx) {
      return this._activeTx.tx.run(query, params);
    }
    const session = this.driver.session();
    try {
      return await session.run(query, params);
    } finally {
      await session.close();
    }
  }

  /**
   * Execute `fn` inside a single Neo4j transaction. All backend calls made
   * by `fn` share one session + transaction, eliminating per-call overhead.
   * Nested calls are pass-through (the outer transaction wins).
   */
  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this._activeTx) {
      // Already inside a transaction — just run fn directly (no nesting).
      return fn();
    }

    const session = this.driver.session();
    const tx = session.beginTransaction();
    this._activeTx = { session, tx };
    try {
      const result = await fn();
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    } finally {
      this._activeTx = null;
      await session.close();
    }
  }

  /** Convert a Neo4j record node to a GraphNode. */
  private toGraphNode(record: any): GraphNode {
    const props = record.properties ? { ...record.properties } : {};
    // Convert neo4j integers to JS numbers
    for (const key of Object.keys(props)) {
      if (neo4j.isInt(props[key])) {
        props[key] = props[key].toNumber();
      }
    }
    const label = record.labels ? record.labels[0] : '';
    const id = props.id || '';
    delete props.id;
    return { label, id, properties: props };
  }

  // --- Lifecycle ---

  async initialize(): Promise<void> {
    // Index creation needs auto-commit — uses its own session.
    const session = this.driver.session();
    try {
      await session.run('CREATE INDEX topic_path_idx IF NOT EXISTS FOR (t:Topic) ON (t.path)');
      await session.run('CREATE INDEX topic_id_idx IF NOT EXISTS FOR (t:Topic) ON (t.id)');
      await session.run('CREATE INDEX exploration_id_idx IF NOT EXISTS FOR (e:Exploration) ON (e.id)');
      await session.run('CREATE INDEX user_address_idx IF NOT EXISTS FOR (u:User) ON (u.address)');
      await session.run('CREATE INDEX user_id_idx IF NOT EXISTS FOR (u:User) ON (u.id)');
      await session.run('CREATE INDEX txlog_timestamp_idx IF NOT EXISTS FOR (tx:TxLog) ON (tx.timestamp)');
      await session.run('CREATE INDEX txlog_id_idx IF NOT EXISTS FOR (tx:TxLog) ON (tx.id)');
      await session.run('CREATE INDEX snapshot_created_idx IF NOT EXISTS FOR (s:Snapshot) ON (s.created_at)');
      await session.run('CREATE INDEX snapshot_id_idx IF NOT EXISTS FOR (s:Snapshot) ON (s.id)');
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  // --- Write ---

  async createNode(node: GraphNode): Promise<void> {
    const props = { ...node.properties, id: node.id };
    await this.runQuery(
      `CREATE (n:${node.label} $props)`,
      { props }
    );
  }

  async mergeNode(label: string, id: string, properties: Record<string, any>): Promise<void> {
    await this.runQuery(
      `MERGE (n:${label} {id: $id}) ON CREATE SET n += $props ON MATCH SET n += $props`,
      { id, props: properties }
    );
  }

  async createEdge(edge: GraphEdge): Promise<void> {
    const propsClause = edge.properties ? ' SET r += $props' : '';
    await this.runQuery(
      `MATCH (a {id: $from}), (b {id: $to}) CREATE (a)-[r:${edge.type}]->(b)${propsClause}`,
      { from: edge.from, to: edge.to, props: edge.properties || {} }
    );
  }

  async mergeEdge(edge: GraphEdge): Promise<void> {
    await this.runQuery(
      `MATCH (a {id: $from}), (b {id: $to}) MERGE (a)-[r:${edge.type}]->(b) ON CREATE SET r += $props ON MATCH SET r += $props`,
      { from: edge.from, to: edge.to, props: edge.properties || {} }
    );
  }

  async incrementEdgeProperty(
    type: string,
    from: string,
    to: string,
    property: string,
    delta: number
  ): Promise<void> {
    await this.runQuery(
      `MATCH (a {id: $from}), (b {id: $to})
       MERGE (a)-[r:${type}]->(b)
       ON CREATE SET r.${property} = $delta
       ON MATCH SET r.${property} = coalesce(r.${property}, 0) + $delta`,
      { from, to, delta }
    );
  }

  // --- Read ---

  async getNode(label: string, id: string): Promise<GraphNode | null> {
    const result = await this.runQuery(
      `MATCH (n:${label} {id: $id}) RETURN n`,
      { id }
    );
    if (result.records.length === 0) return null;
    return this.toGraphNode(result.records[0].get('n'));
  }

  async findNodes(label: string, filter?: Record<string, any>): Promise<GraphNode[]> {
    let query: string;
    let params: Record<string, any> = {};

    if (filter && Object.keys(filter).length > 0) {
      const conditions = Object.keys(filter)
        .map((k, i) => `n.${k} = $filter_${i}`)
        .join(' AND ');
      for (let i = 0; i < Object.keys(filter).length; i++) {
        params[`filter_${i}`] = Object.values(filter)[i];
      }
      query = `MATCH (n:${label}) WHERE ${conditions} RETURN n`;
    } else {
      query = `MATCH (n:${label}) RETURN n`;
    }

    const result = await this.runQuery(query, params);
    return result.records.map((r: any) => this.toGraphNode(r.get('n')));
  }

  async getChildren(
    parentLabel: string,
    parentId: string,
    edgeType: string,
    childLabel: string
  ): Promise<GraphNode[]> {
    const result = await this.runQuery(
      `MATCH (:${parentLabel} {id: $id})-[:${edgeType}]->(c:${childLabel}) RETURN c`,
      { id: parentId }
    );
    return result.records.map((r: any) => this.toGraphNode(r.get('c')));
  }

  async getRoots(label: string, incomingEdgeType: string): Promise<GraphNode[]> {
    const result = await this.runQuery(
      `MATCH (t:${label}) WHERE NOT ()-[:${incomingEdgeType}]->(t) RETURN t`
    );
    return result.records.map((r: any) => this.toGraphNode(r.get('t')));
  }

  async getEdges(nodeId: string, edgeType: string, direction: 'in' | 'out'): Promise<GraphEdge[]> {
    let query: string;
    if (direction === 'out') {
      query = `MATCH (a {id: $id})-[r:${edgeType}]->(b) RETURN a.id AS fromId, b.id AS toId, r`;
    } else {
      query = `MATCH (a)-[r:${edgeType}]->(b {id: $id}) RETURN a.id AS fromId, b.id AS toId, r`;
    }

    const result = await this.runQuery(query, { id: nodeId });
    return result.records.map((r: any) => {
      const props = r.get('r').properties ? { ...r.get('r').properties } : {};
      for (const key of Object.keys(props)) {
        if (neo4j.isInt(props[key])) props[key] = props[key].toNumber();
      }
      return {
        type: edgeType,
        from: r.get('fromId'),
        to: r.get('toId'),
        properties: Object.keys(props).length > 0 ? props : undefined,
      };
    });
  }

  // --- Aggregation ---

  async aggregateOverEdge(
    targetLabel: string,
    targetId: string,
    edgeType: string,
    sourceLabel: string,
    metrics: AggregateMetric[]
  ): Promise<Record<string, number>> {
    // Build the aggregation expressions
    // For knowledge: count explorers, max/avg depth of explorations
    const aggregations = metrics.map((m) => {
      if (m.fn === 'count') {
        return `count(u) AS ${m.property}`;
      } else if (m.fn === 'max') {
        return `max(e.${m.property}) AS ${m.property}`;
      } else if (m.fn === 'avg') {
        return `avg(e.${m.property}) AS ${m.property}`;
      } else if (m.fn === 'sum') {
        return `sum(e.${m.property}) AS ${m.property}`;
      }
      return `count(*) AS ${m.property}`;
    });

    // Query that gathers both explorer count and exploration depths
    const query = `
      OPTIONAL MATCH (u:${sourceLabel})-[r:${edgeType}]->(t:${targetLabel} {id: $id})
      OPTIONAL MATCH (e:Exploration)-[:IN_TOPIC]->(t)
      RETURN count(DISTINCT u) AS explorer_count,
             CASE WHEN count(e) > 0 THEN max(e.depth) ELSE 0 END AS max_depth,
             CASE WHEN count(e) > 0 THEN avg(e.depth) ELSE 0.0 END AS avg_depth
    `;

    const result = await this.runQuery(query, { id: targetId });
    const record = result.records[0];
    const output: Record<string, number> = {};

    for (const m of metrics) {
      if (m.fn === 'count') {
        const val = record.get('explorer_count');
        output[m.property] = neo4j.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
      } else if (m.fn === 'max') {
        const val = record.get('max_depth');
        output[m.property] = neo4j.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
      } else if (m.fn === 'avg') {
        const val = record.get('avg_depth');
        const num = neo4j.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
        output[m.property] = Math.round(num * 100) / 100;
      } else if (m.fn === 'sum') {
        const val = record.get('max_depth');
        output[m.property] = neo4j.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
      }
    }
    return output;
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
    const query = `
      MATCH (:${parentLabel} {id: $id})-[:${parentToChildEdge}]->(child:${childLabel})
      OPTIONAL MATCH (u:User)-[:EXPLORED]->(child)
      OPTIONAL MATCH (e:Exploration)-[:IN_TOPIC]->(child)
      RETURN child.id AS group,
             count(DISTINCT u) AS explorer_count,
             CASE WHEN count(e) > 0 THEN max(e.depth) ELSE 0 END AS max_depth,
             CASE WHEN count(e) > 0 THEN avg(e.depth) ELSE 0.0 END AS avg_depth
    `;

    const result = await this.runQuery(query, { id: parentId });
    return result.records.map((record: any) => {
      const values: Record<string, number> = {};
      for (const m of metrics) {
        if (m.fn === 'count_distinct') {
          const val = record.get('explorer_count');
          values[m.property] = neo4j.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
        } else if (m.fn === 'max') {
          const val = record.get('max_depth');
          values[m.property] = neo4j.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
        } else if (m.fn === 'avg') {
          const val = record.get('avg_depth');
          const num = neo4j.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
          values[m.property] = Math.round(num * 100) / 100;
        }
      }
      return { group: record.get('group'), values };
    });
  }

  // --- Graph traversal ---

  async traverse(
    startId: string,
    edgeType: string,
    direction: 'in' | 'out',
    maxDepth?: number
  ): Promise<GraphPath[]> {
    const depthClause = maxDepth !== undefined ? `*1..${maxDepth}` : '*';
    let query: string;

    if (direction === 'out') {
      query = `MATCH path = (start {id: $id})-[:${edgeType}${depthClause}]->(end)
               RETURN path`;
    } else {
      query = `MATCH path = (end)-[:${edgeType}${depthClause}]->(start {id: $id})
               RETURN path`;
    }

    const result = await this.runQuery(query, { id: startId });
    return result.records.map((record: any) => {
      const path = record.get('path');
      const nodes: GraphNode[] = path.segments.map((seg: any) => this.toGraphNode(seg.end));
      // Add start node at beginning
      nodes.unshift(this.toGraphNode(path.start));

      const edges: GraphEdge[] = path.segments.map((seg: any) => {
        const rel = seg.relationship;
        const props: Record<string, any> = {};
        for (const key of Object.keys(rel.properties || {})) {
          props[key] = neo4j.isInt(rel.properties[key])
            ? rel.properties[key].toNumber()
            : rel.properties[key];
        }
        return {
          type: rel.type,
          from: this.toGraphNode(seg.start).id,
          to: this.toGraphNode(seg.end).id,
          properties: Object.keys(props).length > 0 ? props : undefined,
        };
      });

      return { nodes, edges };
    });
  }

  async shortestPath(
    fromId: string,
    toId: string,
    edgeType: string
  ): Promise<GraphPath | null> {
    const result = await this.runQuery(
      `MATCH path = shortestPath(
         (a {id: $from})-[:${edgeType}*]-(b {id: $to})
       ) RETURN path`,
      { from: fromId, to: toId }
    );

    if (result.records.length === 0) return null;

    const path = result.records[0].get('path');
    const nodes: GraphNode[] = path.segments.map((seg: any) => this.toGraphNode(seg.end));
    nodes.unshift(this.toGraphNode(path.start));

    const edges: GraphEdge[] = path.segments.map((seg: any) => {
      const rel = seg.relationship;
      const props: Record<string, any> = {};
      for (const key of Object.keys(rel.properties || {})) {
        props[key] = neo4j.isInt(rel.properties[key])
          ? rel.properties[key].toNumber()
          : rel.properties[key];
      }
      return {
        type: rel.type,
        from: this.toGraphNode(seg.start).id,
        to: this.toGraphNode(seg.end).id,
        properties: Object.keys(props).length > 0 ? props : undefined,
      };
    });

    return { nodes, edges };
  }

  // --- Ledger ---

  async nodeCount(label?: string): Promise<number> {
    const query = label
      ? `MATCH (n:${label}) RETURN count(n) AS cnt`
      : 'MATCH (n) RETURN count(n) AS cnt';
    const result = await this.runQuery(query);
    const val = result.records[0].get('cnt');
    return neo4j.isInt(val) ? val.toNumber() : val;
  }

  async edgeCount(type?: string): Promise<number> {
    const query = type
      ? `MATCH ()-[r:${type}]->() RETURN count(r) AS cnt`
      : 'MATCH ()-[r]->() RETURN count(r) AS cnt';
    const result = await this.runQuery(query);
    const val = result.records[0].get('cnt');
    return neo4j.isInt(val) ? val.toNumber() : val;
  }

  /** Utility: clear all data in the database (for benchmarks). */
  async clearAll(): Promise<void> {
    await this.runQuery('MATCH (n) DETACH DELETE n');
  }
}
