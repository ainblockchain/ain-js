import { KnowledgeGraph } from '../src/knowledge/knowledge-graph';
import { MemoryBackend } from '../src/knowledge/memory-backend';
import { ExploreInput } from '../src/knowledge/types';

jest.setTimeout(30000);

const ADDR = '0xTestUser';

// Small dataset: 3 topics, 5 explorations with builds-on chains
const TOPICS = [
  { path: 'ai', title: 'AI', description: 'Artificial Intelligence' },
  { path: 'ai/transformers', title: 'Transformers', description: 'Transformer architectures' },
  { path: 'ai/transformers/attention', title: 'Attention', description: 'Attention mechanisms' },
  { path: 'ai/vision', title: 'Vision', description: 'Computer vision' },
];

function makeInput(overrides: Partial<ExploreInput> & { topicPath: string; title: string }): ExploreInput {
  return {
    content: `Content for ${overrides.title}`,
    summary: `Summary of ${overrides.title}`,
    depth: 2,
    tags: '',
    ...overrides,
  };
}

describe('KnowledgeGraph with MemoryBackend', () => {
  let backend: MemoryBackend;
  let kg: KnowledgeGraph;

  beforeEach(async () => {
    backend = new MemoryBackend();
    await backend.initialize();
    kg = new KnowledgeGraph(backend, ADDR);
  });

  afterEach(async () => {
    await backend.close();
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------
  describe('Lifecycle', () => {
    it('should initialize and close without error', async () => {
      const b = new MemoryBackend();
      await b.initialize();
      await b.close();
    });
  });

  // -----------------------------------------------------------------------
  // Topic Registration
  // -----------------------------------------------------------------------
  describe('Topic Registration', () => {
    it('should register a topic and retrieve it', async () => {
      await kg.registerTopic('ai', { title: 'AI', description: 'Artificial Intelligence' });
      const info = await kg.getTopicInfo('ai');
      expect(info).not.toBeNull();
      expect(info!.title).toBe('AI');
      expect(info!.description).toBe('Artificial Intelligence');
      expect(info!.created_by).toBe(ADDR);
      expect(typeof info!.created_at).toBe('number');
    });

    it('should register nested topics with PARENT_OF edges', async () => {
      await kg.registerTopic('ai', { title: 'AI', description: 'AI' });
      await kg.registerTopic('ai/transformers', { title: 'Transformers', description: 'Transformers' });
      await kg.registerTopic('ai/transformers/attention', { title: 'Attention', description: 'Attention' });

      const subtopics = await kg.listSubtopics('ai');
      expect(subtopics).toContain('ai/transformers');

      const subSub = await kg.listSubtopics('ai/transformers');
      expect(subSub).toContain('ai/transformers/attention');
    });

    it('should list root topics', async () => {
      await kg.registerTopic('ai', { title: 'AI', description: 'AI' });
      await kg.registerTopic('ai/transformers', { title: 'Transformers', description: 'Transformers' });
      await kg.registerTopic('math', { title: 'Math', description: 'Mathematics' });

      const roots = await kg.listTopics();
      expect(roots).toContain('ai');
      expect(roots).toContain('math');
      expect(roots).not.toContain('ai/transformers');
    });

    it('should list subtopics', async () => {
      for (const t of TOPICS) {
        await kg.registerTopic(t.path, { title: t.title, description: t.description });
      }

      const subs = await kg.listSubtopics('ai');
      expect(subs.sort()).toEqual(['ai/transformers', 'ai/vision']);
    });
  });

  // -----------------------------------------------------------------------
  // Explore
  // -----------------------------------------------------------------------
  describe('Explore', () => {
    beforeEach(async () => {
      for (const t of TOPICS) {
        await kg.registerTopic(t.path, { title: t.title, description: t.description });
      }
    });

    it('should create an exploration and return an id', async () => {
      const id = await kg.explore(makeInput({
        topicPath: 'ai/transformers/attention',
        title: 'Paper A',
      }));
      expect(typeof id).toBe('string');
      expect(id.length).toBe(20); // PushId length
    });

    it('should store content hash on every exploration', async () => {
      const id = await kg.explore(makeInput({
        topicPath: 'ai/transformers/attention',
        title: 'Paper A',
      }));
      const node = await backend.getNode('Exploration', id);
      expect(node).not.toBeNull();
      expect(typeof node!.properties.content_hash).toBe('string');
      expect(node!.properties.content_hash.length).toBe(64); // SHA-256 hex
    });

    it('should parse builds-on tags into BUILDS_ON edges', async () => {
      const parentId = await kg.explore(makeInput({
        topicPath: 'ai/transformers/attention',
        title: 'Parent Paper',
      }));
      const childId = await kg.explore(makeInput({
        topicPath: 'ai/transformers/attention',
        title: 'Child Paper',
        tags: `attention,builds-on:${parentId}`,
      }));

      const edges = await backend.getEdges(childId, 'BUILDS_ON', 'out');
      expect(edges.length).toBe(1);
      expect(edges[0].to).toBe(parentId);
    });

    it('should increment EXPLORED edge count', async () => {
      await kg.explore(makeInput({
        topicPath: 'ai/transformers/attention',
        title: 'Paper A',
      }));
      await kg.explore(makeInput({
        topicPath: 'ai/transformers/attention',
        title: 'Paper B',
      }));

      const edges = await backend.getEdges('ai/transformers/attention', 'EXPLORED', 'in');
      expect(edges.length).toBe(1);
      expect(edges[0].properties!.count).toBe(2);
    });

    it('should create TxLog entry for each write', async () => {
      await kg.explore(makeInput({
        topicPath: 'ai/transformers/attention',
        title: 'Paper A',
      }));

      const txLogs = await backend.findNodes('TxLog');
      // 4 topic registrations + 1 explore = 5 TxLog entries
      expect(txLogs.length).toBe(TOPICS.length + 1);
      const exploreTx = txLogs.find(tx => tx.properties.op === 'explore');
      expect(exploreTx).toBeDefined();
      expect(exploreTx!.properties.actor).toBe(ADDR);
    });

    it('should be append-only (duplicate creates new node)', async () => {
      const id1 = await kg.explore(makeInput({
        topicPath: 'ai/transformers/attention',
        title: 'Same Title',
        content: 'Content v1',
      }));
      const id2 = await kg.explore(makeInput({
        topicPath: 'ai/transformers/attention',
        title: 'Same Title',
        content: 'Content v2',
      }));

      expect(id1).not.toBe(id2);
      const count = await backend.nodeCount('Exploration');
      expect(count).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Read Operations
  // -----------------------------------------------------------------------
  describe('Read Operations', () => {
    let expIds: string[];

    beforeEach(async () => {
      for (const t of TOPICS) {
        await kg.registerTopic(t.path, { title: t.title, description: t.description });
      }
      expIds = [];
      // Create a chain: A -> B -> C in attention topic
      const idA = await kg.explore(makeInput({
        topicPath: 'ai/transformers/attention',
        title: 'Paper A',
        depth: 3,
        tags: 'foundational',
      }));
      expIds.push(idA);

      const idB = await kg.explore(makeInput({
        topicPath: 'ai/transformers/attention',
        title: 'Paper B',
        depth: 4,
        tags: `attention,builds-on:${idA}`,
      }));
      expIds.push(idB);

      const idC = await kg.explore(makeInput({
        topicPath: 'ai/transformers/attention',
        title: 'Paper C',
        depth: 5,
        tags: `deep,builds-on:${idB}`,
      }));
      expIds.push(idC);

      // One in vision topic
      const idD = await kg.explore(makeInput({
        topicPath: 'ai/vision',
        title: 'Vision Paper',
        depth: 2,
        tags: 'vision',
      }));
      expIds.push(idD);
    });

    it('should get explorations by user and topic', async () => {
      const result = await kg.getExplorations(ADDR, 'ai/transformers/attention');
      expect(result).not.toBeNull();
      const keys = Object.keys(result!);
      expect(keys.length).toBe(3);
      expect(result![expIds[0]].title).toBe('Paper A');
    });

    it('should get explorations by user across all topics', async () => {
      const result = await kg.getExplorationsByUser(ADDR);
      expect(result).not.toBeNull();
      const topicKeys = Object.keys(result!);
      expect(topicKeys.length).toBe(2); // attention and vision
    });

    it('should get explorers for a topic', async () => {
      const explorers = await kg.getExplorers('ai/transformers/attention');
      expect(explorers).toContain(ADDR);
      expect(explorers.length).toBe(1);
    });

    it('should compute topic stats (explorer_count, max_depth, avg_depth)', async () => {
      const stats = await kg.getTopicStats('ai/transformers/attention');
      expect(stats.explorer_count).toBe(1);
      expect(stats.max_depth).toBe(5);
      expect(stats.avg_depth).toBe(4); // (3+4+5)/3 = 4
    });

    it('should compute frontier map for subtopics', async () => {
      const map = await kg.getFrontierMap('ai');
      expect(map.length).toBe(2); // transformers and vision

      const transformers = map.find(e => e.topic === 'ai/transformers');
      expect(transformers).toBeDefined();

      const vision = map.find(e => e.topic === 'ai/vision');
      expect(vision).toBeDefined();
      expect(vision!.stats.explorer_count).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Graph Traversal
  // -----------------------------------------------------------------------
  describe('Graph Traversal', () => {
    let idA: string, idB: string, idC: string, idD: string;

    beforeEach(async () => {
      await kg.registerTopic('ai', { title: 'AI', description: 'AI' });
      await kg.registerTopic('ai/transformers', { title: 'Transformers', description: 'T' });

      idA = await kg.explore(makeInput({
        topicPath: 'ai/transformers',
        title: 'Root Paper',
        depth: 1,
        tags: 'root',
      }));

      idB = await kg.explore(makeInput({
        topicPath: 'ai/transformers',
        title: 'Child 1',
        depth: 2,
        tags: `child,builds-on:${idA}`,
      }));

      idC = await kg.explore(makeInput({
        topicPath: 'ai/transformers',
        title: 'Grandchild',
        depth: 3,
        tags: `grandchild,builds-on:${idB}`,
      }));

      // Disconnected node
      idD = await kg.explore(makeInput({
        topicPath: 'ai/transformers',
        title: 'Isolated Paper',
        depth: 1,
        tags: 'isolated',
      }));
    });

    it('should get lineage (ancestor chain via BUILDS_ON)', async () => {
      const lineage = await kg.getLineage(idC);
      // lineage traverses out via BUILDS_ON: C -> B -> A
      expect(lineage.length).toBeGreaterThanOrEqual(2);
      const titles = lineage.map(e => e.title);
      // Should include the starting node and the ancestors
      expect(titles).toContain('Grandchild');
      expect(titles).toContain('Child 1');
    });

    it('should get descendants', async () => {
      const descendants = await kg.getDescendants(idA);
      expect(descendants.length).toBe(2); // B and C
      const titles = descendants.map(e => e.title);
      expect(titles).toContain('Child 1');
      expect(titles).toContain('Grandchild');
    });

    it('should find shortest path between two explorations', async () => {
      const path = await kg.getShortestPath(idA, idC);
      expect(path.length).toBeGreaterThanOrEqual(2);
      // Path from A to C goes through B
      const titles = path.map(e => e.title);
      expect(titles).toContain('Root Paper');
      expect(titles).toContain('Grandchild');
    });

    it('should return empty for unconnected nodes', async () => {
      const path = await kg.getShortestPath(idA, idD);
      expect(path).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Ledger Operations
  // -----------------------------------------------------------------------
  describe('Ledger Operations', () => {
    beforeEach(async () => {
      await kg.registerTopic('ai', { title: 'AI', description: 'AI' });
      await kg.explore(makeInput({
        topicPath: 'ai',
        title: 'Paper 1',
      }));
      await kg.explore(makeInput({
        topicPath: 'ai',
        title: 'Paper 2',
      }));
    });

    it('should take a snapshot with correct counts', async () => {
      const nodesBefore = await backend.nodeCount();
      const edgesBefore = await backend.edgeCount();
      const snap = await kg.takeSnapshot();
      expect(typeof snap.id).toBe('string');
      // snapshot records counts BEFORE adding the Snapshot node itself
      expect(snap.node_count).toBe(nodesBefore);
      expect(snap.rel_count).toBe(edgesBefore);
      // 1 topic registration + 2 explores = 3 TxLog entries
      expect(snap.tx_count).toBe(3);
    });

    it('should get TxLog entries', async () => {
      const txLog = await kg.getTxLog();
      expect(txLog.length).toBe(3);
      expect(txLog[0].properties.op).toBe('registerTopic');
      expect(txLog[1].properties.op).toBe('explore');
      expect(txLog[2].properties.op).toBe('explore');
    });

    it('should filter TxLog by timestamp', async () => {
      const allTx = await kg.getTxLog();
      expect(allTx.length).toBe(3);
      // Use a timestamp just after the last entry to get nothing
      const futureTs = allTx[allTx.length - 1].properties.timestamp + 1;
      const none = await kg.getTxLog(futureTs);
      expect(none.length).toBe(0);
      // Use the first entry's timestamp to get all
      const all = await kg.getTxLog(allTx[0].properties.timestamp);
      expect(all.length).toBe(3);
    });

    it('should verify content integrity (all hashes valid)', async () => {
      const integrity = await kg.verifyIntegrity();
      expect(integrity.total).toBe(2);
      expect(integrity.valid).toBe(2);
      expect(integrity.invalid).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Access
  // -----------------------------------------------------------------------
  describe('Access', () => {
    it('should return content for free explorations', async () => {
      await kg.registerTopic('ai', { title: 'AI', description: 'AI' });
      const id = await kg.explore(makeInput({
        topicPath: 'ai',
        title: 'Free Paper',
        content: 'This is free content.',
      }));

      const result = await kg.access(ADDR, 'ai', id);
      expect(result.content).toBe('This is free content.');
      expect(result.paid).toBe(false);
    });

    it('should throw for non-existent exploration', async () => {
      await expect(
        kg.access(ADDR, 'ai', 'nonexistent-id')
      ).rejects.toThrow('Exploration not found');
    });
  });
});
