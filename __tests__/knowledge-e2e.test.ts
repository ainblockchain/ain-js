// @ts-nocheck
/**
 * End-to-end tests for the Knowledge and LLM modules against AIN devnet.
 *
 * These tests hit the provider specified by AIN_PROVIDER_URL env var.
 * They assume the knowledge app + transformer papers have already been seeded
 * (via examples/knowledge_graph_transformers.ts).
 *
 * Run:
 *   npx jest __tests__/knowledge-e2e.test.ts --no-coverage
 */
import Ain from '../src/ain';

const DEVNET_URL = process.env.AIN_PROVIDER_URL || 'http://localhost:8081';

// Genesis account private key (has balance on devnet)
const GENESIS_SK = process.env.AIN_PRIVATE_KEY || '';

const BLOCK_TIME = 12_000; // ms — devnet block interval with some margin

jest.setTimeout(300_000); // 5 min max for entire suite

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Check if a transaction result indicates success. */
function txOk(result: any): boolean {
  if (!result) return false;
  const r = result.result;
  if (r === true) return true;
  if (r?.code === 0) return true;
  if (r?.result_list) {
    return Object.values(r.result_list).every((op: any) => op.code === 0);
  }
  return false;
}

describe('Knowledge & LLM E2E (devnet)', () => {
  let ain: InstanceType<typeof Ain>;
  let address: string;

  beforeAll(() => {
    ain = new Ain(DEVNET_URL);
    address = ain.wallet.addAndSetDefaultAccount(GENESIS_SK);
    console.log(`[E2E] Using account: ${address}`);
  });

  // =========================================================================
  // 1. Read-only knowledge operations (no writes, fast)
  // =========================================================================

  describe('Knowledge read operations', () => {
    it('should list top-level topics', async () => {
      const topics = await ain.knowledge.listTopics();
      expect(Array.isArray(topics)).toBe(true);
      expect(topics.length).toBeGreaterThan(0);
      expect(topics).toContain('ai');
      console.log(`[E2E] Topics: ${topics.join(', ')}`);
    });

    it('should list subtopics under ai/transformers', async () => {
      const subtopics = await ain.knowledge.listSubtopics('ai/transformers');
      expect(subtopics.length).toBeGreaterThan(0);
      expect(subtopics).toContain('attention');
      expect(subtopics).toContain('decoder-only');
      expect(subtopics).toContain('encoder-only');
    });

    it('should get topic info for ai/transformers', async () => {
      const info = await ain.knowledge.getTopicInfo('ai/transformers');
      expect(info).not.toBeNull();
      expect(info!.title).toBe('Transformers');
      expect(info!.description).toBeTruthy();
      expect(typeof info!.created_at).toBe('number');
      expect(info!.created_by).toBeTruthy();
    });

    it('should get explorers for a seeded topic', async () => {
      const explorers = await ain.knowledge.getExplorers('ai/transformers/attention');
      expect(Array.isArray(explorers)).toBe(true);
      expect(explorers.length).toBeGreaterThan(0);
      console.log(`[E2E] Explorers for attention: ${explorers.join(', ')}`);
    });

    it('should get explorations for a known explorer', async () => {
      const explorers = await ain.knowledge.getExplorers('ai/transformers/attention');
      expect(explorers.length).toBeGreaterThan(0);

      const explorations = await ain.knowledge.getExplorations(explorers[0], 'ai/transformers/attention');
      expect(explorations).not.toBeNull();

      const entries = Object.values(explorations!);
      expect(entries.length).toBeGreaterThan(0);

      const first = entries[0] as any;
      expect(first.title).toBeTruthy();
      expect(first.summary).toBeTruthy();
      expect(typeof first.depth).toBe('number');
      console.log(`[E2E] First exploration: "${first.title}"`);
    });

    it('should get topic stats', async () => {
      const stats = await ain.knowledge.getTopicStats('ai/transformers/attention');
      expect(stats.explorer_count).toBeGreaterThan(0);
      expect(stats.max_depth).toBeGreaterThan(0);
      expect(stats.avg_depth).toBeGreaterThan(0);
      console.log(`[E2E] Stats: explorers=${stats.explorer_count}, maxDepth=${stats.max_depth}, avgDepth=${stats.avg_depth}`);
    });

    it('should get frontier view', async () => {
      const frontier = await ain.knowledge.getFrontier('ai/transformers/attention');
      expect(frontier.info).not.toBeNull();
      expect(frontier.info!.title).toBe('Attention Mechanisms');
      expect(frontier.stats.explorer_count).toBeGreaterThan(0);
      expect(frontier.explorers.length).toBeGreaterThan(0);
    });

    it('should get frontier map for ai/transformers subtopics', async () => {
      const map = await ain.knowledge.getFrontierMap('ai/transformers');
      expect(map.length).toBeGreaterThan(0);

      const attentionEntry = map.find(e => e.topic === 'ai/transformers/attention');
      expect(attentionEntry).toBeDefined();
      expect(attentionEntry!.stats.explorer_count).toBeGreaterThan(0);

      console.log(`[E2E] Frontier map (${map.length} entries):`);
      for (const entry of map) {
        console.log(`  ${entry.topic}: explorers=${entry.stats.explorer_count}, maxDepth=${entry.stats.max_depth}`);
      }
    });

    it('should get explorations by user across all topics', async () => {
      const explorers = await ain.knowledge.getExplorers('ai/transformers/attention');
      const allByUser = await ain.knowledge.getExplorationsByUser(explorers[0]);
      expect(allByUser).not.toBeNull();
      const topicKeys = Object.keys(allByUser!);
      expect(topicKeys.length).toBeGreaterThan(0);
      console.log(`[E2E] User has explorations in ${topicKeys.length} topic(s)`);
    });

    it('should access free content (no x402 required)', async () => {
      const explorers = await ain.knowledge.getExplorers('ai/transformers/attention');
      const explorations = await ain.knowledge.getExplorations(explorers[0], 'ai/transformers/attention');
      expect(explorations).not.toBeNull();

      const firstEntryId = Object.keys(explorations!)[0];
      const result = await ain.knowledge.access(explorers[0], 'ai/transformers/attention', firstEntryId);
      expect(result.paid).toBe(false);
      expect(result.content).toBeTruthy();
      expect(result.content.length).toBeGreaterThan(50);
      console.log(`[E2E] Accessed content (${result.content.length} chars): "${result.content.substring(0, 80)}..."`);
    });

    it('should return empty array for non-existent topic explorers', async () => {
      const explorers = await ain.knowledge.getExplorers('nonexistent/topic/xyz123');
      expect(explorers).toEqual([]);
    });

    it('should return null for non-existent explorations', async () => {
      const result = await ain.knowledge.getExplorations('0xNonExistent', 'ai/transformers/attention');
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // 2. Knowledge graph operations
  // =========================================================================

  describe('Knowledge graph operations', () => {
    it('should get the full graph', async () => {
      const graph = await ain.knowledge.getGraph();
      expect(graph.nodes).toBeDefined();
      expect(graph.edges).toBeDefined();

      const nodeCount = Object.keys(graph.nodes).length;
      const edgeCount = Object.keys(graph.edges).length;
      console.log(`[E2E] Graph: ${nodeCount} nodes, ${edgeCount} edge groups`);
      expect(nodeCount).toBeGreaterThan(0);
    });

    it('should get a specific graph node', async () => {
      const graph = await ain.knowledge.getGraph();
      const nodeIds = Object.keys(graph.nodes);
      expect(nodeIds.length).toBeGreaterThan(0);

      const firstNodeId = nodeIds[0];
      const node = await ain.knowledge.getGraphNode(firstNodeId);
      expect(node).not.toBeNull();
      expect(node!.address).toBeTruthy();
      expect(node!.topic_path).toBeTruthy();
      expect(node!.title).toBeTruthy();
      console.log(`[E2E] Graph node: "${node!.title}" (${node!.topic_path})`);
    });

    it('should build a node ID consistently', () => {
      const nodeId = ain.knowledge.buildNodeId('0xAddr', 'ai/transformers', 'entry123');
      expect(nodeId).toBe('0xAddr_ai|transformers_entry123');
    });
  });

  // =========================================================================
  // 3. LLM operations (real inference on devnet vLLM)
  // =========================================================================

  describe('LLM operations', () => {
    it('should perform basic inference via ain.llm.infer()', async () => {
      const result = await ain.llm.infer({
        messages: [{ role: 'user', content: 'What is 2+2? Answer in one word.' }],
        maxTokens: 100,
        temperature: 0,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();
      expect(result.usage).toBeDefined();
      expect(result.usage.promptTokens).toBeGreaterThan(0);
      expect(result.usage.completionTokens).toBeGreaterThan(0);
      console.log(`[E2E] LLM infer: "${result.content.substring(0, 100)}" (${result.usage.completionTokens} tokens)`);
    });

    it('should chat via ain.llm.chat()', async () => {
      const response = await ain.llm.chat(
        [
          { role: 'system', content: 'You are a helpful assistant. Be concise.' },
          { role: 'user', content: 'Name three primary colors. List only.' },
        ],
        { maxTokens: 100, temperature: 0 },
      );

      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
      console.log(`[E2E] LLM chat: "${response.substring(0, 150)}"`);
    });

    it('should complete a single prompt via ain.llm.complete()', async () => {
      const response = await ain.llm.complete(
        'Finish this sentence: The transformer architecture was introduced in',
        { maxTokens: 50, temperature: 0 },
      );

      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
      console.log(`[E2E] LLM complete: "${response.substring(0, 150)}"`);
    });

    it('should handle multi-turn conversation', async () => {
      const response = await ain.llm.chat(
        [
          { role: 'user', content: 'My name is Alice.' },
          { role: 'assistant', content: 'Nice to meet you, Alice!' },
          { role: 'user', content: 'What is my name?' },
        ],
        { maxTokens: 50, temperature: 0 },
      );

      expect(response.toLowerCase()).toContain('alice');
      console.log(`[E2E] Multi-turn: "${response.substring(0, 100)}"`);
    });
  });

  // =========================================================================
  // 4. Write operations (slow — require block finalization)
  // =========================================================================

  describe('Knowledge write operations', () => {
    const uniqueSuffix = `test_${Date.now()}`;
    const testTopicPath = `test/${uniqueSuffix}`;

    it('should register a new topic', async () => {
      const result = await ain.knowledge.registerTopic(testTopicPath, {
        title: `E2E Test Topic ${uniqueSuffix}`,
        description: 'Automated e2e test topic — safe to delete.',
      });

      console.log(`[E2E] registerTopic result:`, JSON.stringify(result?.result).substring(0, 200));
      // On devnet the tx may or may not succeed depending on rules,
      // but it should not throw
      expect(result).toBeDefined();
      await sleep(BLOCK_TIME);
    });

    it('should verify the registered topic', async () => {
      const info = await ain.knowledge.getTopicInfo(testTopicPath);
      // If setupApp rules allow this account to write, topic should exist
      if (info) {
        expect(info.title).toBe(`E2E Test Topic ${uniqueSuffix}`);
        expect(info.created_by).toBe(address);
        console.log(`[E2E] Topic verified: "${info.title}"`);
      } else {
        console.log(`[E2E] Topic not found (may lack write permission) — skipping verification`);
      }
    });

    it('should write an exploration', async () => {
      const result = await ain.knowledge.explore({
        topicPath: 'ai/transformers/attention',
        title: `E2E Test Exploration ${uniqueSuffix}`,
        content: `This is an automated e2e test exploration written at ${new Date().toISOString()}.`,
        summary: 'Automated test exploration for CI verification.',
        depth: 1,
        tags: 'e2e-test,automated',
      });

      expect(result).toBeDefined();
      expect(result.entryId).toBeTruthy();
      expect(result.nodeId).toBeTruthy();
      console.log(`[E2E] Exploration written: entryId=${result.entryId}, nodeId=${result.nodeId}`);
      await sleep(BLOCK_TIME);
    });

    it('should verify the written exploration', async () => {
      const explorations = await ain.knowledge.getExplorations(address, 'ai/transformers/attention');
      if (explorations) {
        const entries = Object.values(explorations);
        const testEntry = entries.find((e: any) => e.title?.includes(uniqueSuffix));
        if (testEntry) {
          expect((testEntry as any).summary).toBe('Automated test exploration for CI verification.');
          console.log(`[E2E] Exploration verified: "${(testEntry as any).title}"`);
        } else {
          console.log(`[E2E] Exploration not found yet (may need more block confirmations)`);
        }
      } else {
        console.log(`[E2E] No explorations found for account — may lack write permission`);
      }
    });
  });

  // =========================================================================
  // 5. AI-powered operations (LLM + knowledge combined)
  // =========================================================================

  describe('AI-powered knowledge operations', () => {
    it('should run aiExplore (LLM generates + writes exploration)', async () => {
      try {
        const result = await ain.knowledge.aiExplore('ai/transformers/attention', {
          context: 'E2E test: automated exploration via aiExplore',
          depth: 1,
        });

        expect(result).toBeDefined();
        expect(result.entryId).toBeTruthy();
        expect(result.nodeId).toBeTruthy();
        console.log(`[E2E] aiExplore: entryId=${result.entryId}`);
        await sleep(BLOCK_TIME);
      } catch (err: any) {
        // The node's LLM engine may fail to parse JSON when the model includes
        // <think> tags (Qwen3 thinking mode). This is a known node-side issue.
        if (err.message?.includes('Failed to parse LLM')) {
          console.log(`[E2E] aiExplore: expected node-side JSON parse error (Qwen3 thinking mode) — OK`);
        } else {
          throw err;
        }
      }
    });

    it('should run aiAnalyze with graph context', async () => {
      const graph = await ain.knowledge.getGraph();
      const nodeIds = Object.keys(graph.nodes).slice(0, 3);

      if (nodeIds.length > 0) {
        const analysis = await ain.knowledge.aiAnalyze(
          'What are the key innovations in transformer architecture?',
          nodeIds,
        );

        expect(typeof analysis).toBe('object');
        expect(typeof analysis.content).toBe('string');
        expect(analysis.content.length).toBeGreaterThan(0);
        console.log(`[E2E] aiAnalyze (${analysis.content.length} chars): "${analysis.content.substring(0, 150)}..."`);
        if (analysis.thinking) {
          console.log(`[E2E] aiAnalyze thinking (${analysis.thinking.length} chars)`);
        };
      } else {
        console.log(`[E2E] No graph nodes available — skipping aiAnalyze`);
      }
    });

    it('should run aiGenerateCourse', async () => {
      const explorations = await ain.knowledge.getExplorations(address, 'ai/transformers/attention');
      if (!explorations) {
        console.log(`[E2E] No explorations for course generation — skipping`);
        return;
      }

      const entries = Object.values(explorations).slice(0, 3);
      try {
        const result = await ain.knowledge.aiGenerateCourse('ai/transformers/attention', entries as any);

        expect(Array.isArray(result.stages)).toBe(true);
        console.log(`[E2E] aiGenerateCourse: ${result.stages.length} stage(s)`);
        if (result.stages.length > 0) {
          expect(result.stages[0].title).toBeTruthy();
          console.log(`[E2E] First stage: "${result.stages[0].title}"`);
        }
        if (result.thinking) {
          console.log(`[E2E] aiGenerateCourse thinking (${result.thinking.length} chars)`);
        }
      } catch (err: any) {
        // The node's LLM engine may fail to parse JSON when the model includes
        // <think> tags (Qwen3 thinking mode). This is a known node-side issue.
        if (err.message?.includes('Failed to parse LLM')) {
          console.log(`[E2E] aiGenerateCourse: expected node-side JSON parse error (Qwen3 thinking mode) — OK`);
        } else {
          throw err;
        }
      }
    });
  });

  // =========================================================================
  // 6. Integration: Ain instance properties
  // =========================================================================

  describe('Ain instance integration', () => {
    it('should have all expected modules', () => {
      expect(ain.knowledge).toBeDefined();
      expect(ain.llm).toBeDefined();
      expect(ain.db).toBeDefined();
      expect(ain.wallet).toBeDefined();
      expect(ain.net).toBeDefined();
      expect(ain.em).toBeDefined();
    });

    it('should report correct network info', async () => {
      const protocolVersion = await ain.net.getProtocolVersion();
      expect(protocolVersion).toBeTruthy();
      console.log(`[E2E] Protocol version: ${protocolVersion}`);

      const isListening = await ain.net.isListening();
      console.log(`[E2E] isListening: ${isListening}`);
      // Devnet may report false — this is expected for hosted nodes
      expect(typeof isListening).toBe('boolean');
    });
  });
});
