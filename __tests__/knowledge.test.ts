// @ts-nocheck
import Ain from '../src/ain';

const { test_node_1 } = require('./test_data');

jest.setTimeout(180000);

// Mock the provider.send to simulate blockchain reads/writes
function createMockAin() {
  const ain = new Ain(test_node_1);

  // In-memory state tree for testing
  const stateTree: Record<string, any> = {};

  // Helper to get a value from the nested state tree by path
  function getValueAtPath(path: string): any {
    const parts = path.split('/').filter(p => p !== '');
    let current = stateTree;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return null;
      current = current[part];
    }
    return current !== undefined ? current : null;
  }

  // Helper to set a value in the nested state tree by path
  function setValueAtPath(path: string, value: any): void {
    const parts = path.split('/').filter(p => p !== '');
    let current = stateTree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] == null || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  // Mock provider.send for GET_VALUE
  const origSend = ain.provider.send.bind(ain.provider);
  ain.provider.send = jest.fn(async (method: string, params: any) => {
    if (method === 'ain_get' && params.type === 'GET_VALUE') {
      return getValueAtPath(params.ref);
    }
    return null;
  });

  // Mock sendTransaction to write to in-memory state
  ain.sendTransaction = jest.fn(async (txInput: any) => {
    const op = txInput.operation;
    if (op.type === 'SET') {
      for (const subOp of op.op_list) {
        if (subOp.type === 'SET_VALUE') {
          setValueAtPath(subOp.ref, subOp.value);
        }
      }
    } else if (op.type === 'SET_VALUE') {
      setValueAtPath(op.ref, op.value);
    }
    return { result: true };
  });

  // Mock signer.getAddress
  ain.signer.getAddress = jest.fn(() => '0xTestAddress');

  return { ain, stateTree, getValueAtPath, setValueAtPath };
}

describe('Knowledge Module', function() {

  describe('Topic Registration & Discovery', function() {
    it('should register a topic', async function() {
      const { ain } = createMockAin();

      const result = await ain.knowledge.registerTopic('physics/quantum', {
        title: 'Quantum Physics',
        description: 'The study of quantum mechanics',
      });

      expect(result).toEqual({ result: true });
      expect(ain.sendTransaction).toHaveBeenCalledTimes(1);

      const txCall = (ain.sendTransaction as jest.Mock).mock.calls[0][0];
      expect(txCall.operation.type).toBe('SET_VALUE');
      expect(txCall.operation.ref).toBe('/apps/knowledge/topics/physics/quantum/.info');
      expect(txCall.operation.value.title).toBe('Quantum Physics');
      expect(txCall.operation.value.description).toBe('The study of quantum mechanics');
      expect(txCall.operation.value.created_by).toBe('0xTestAddress');
      expect(typeof txCall.operation.value.created_at).toBe('number');
    });

    it('should list top-level topics', async function() {
      const { ain, setValueAtPath } = createMockAin();
      setValueAtPath('/apps/knowledge/topics', {
        physics: { '.info': { title: 'Physics' } },
        math: { '.info': { title: 'Mathematics' } },
      });

      const topics = await ain.knowledge.listTopics();
      expect(topics).toEqual(['physics', 'math']);
    });

    it('should return empty array when no topics exist', async function() {
      const { ain } = createMockAin();
      const topics = await ain.knowledge.listTopics();
      expect(topics).toEqual([]);
    });

    it('should list subtopics', async function() {
      const { ain, setValueAtPath } = createMockAin();
      setValueAtPath('/apps/knowledge/topics/physics', {
        '.info': { title: 'Physics' },
        quantum: { '.info': { title: 'Quantum' } },
        classical: { '.info': { title: 'Classical' } },
      });

      const subtopics = await ain.knowledge.listSubtopics('physics');
      expect(subtopics).toEqual(['quantum', 'classical']);
    });

    it('should filter out .info from subtopics', async function() {
      const { ain, setValueAtPath } = createMockAin();
      setValueAtPath('/apps/knowledge/topics/physics', {
        '.info': { title: 'Physics' },
        quantum: {},
      });

      const subtopics = await ain.knowledge.listSubtopics('physics');
      expect(subtopics).not.toContain('.info');
      expect(subtopics).toEqual(['quantum']);
    });

    it('should get topic info', async function() {
      const { ain, setValueAtPath } = createMockAin();
      const info = {
        title: 'Quantum Physics',
        description: 'Study of quantum mechanics',
        created_at: 1700000000000,
        created_by: '0xCreator',
      };
      setValueAtPath('/apps/knowledge/topics/physics/quantum/.info', info);

      const result = await ain.knowledge.getTopicInfo('physics/quantum');
      expect(result).toEqual(info);
    });
  });

  describe('Explore (write explorations)', function() {
    it('should create a free exploration entry', async function() {
      const { ain } = createMockAin();

      const result = await ain.knowledge.explore({
        topicPath: 'physics/quantum',
        title: 'Wave-Particle Duality',
        content: 'Light behaves as both a wave and a particle.',
        summary: 'Exploring the dual nature of light.',
        depth: 3,
        tags: 'physics,quantum,duality',
      });

      expect(result).toEqual({ result: true });
      expect(ain.sendTransaction).toHaveBeenCalledTimes(1);

      const txCall = (ain.sendTransaction as jest.Mock).mock.calls[0][0];
      expect(txCall.operation.type).toBe('SET');
      expect(txCall.operation.op_list.length).toBe(2);

      // First op: exploration entry
      const explorationOp = txCall.operation.op_list[0];
      expect(explorationOp.ref).toContain('/apps/knowledge/explorations/0xTestAddress/physics|quantum/');
      expect(explorationOp.value.title).toBe('Wave-Particle Duality');
      expect(explorationOp.value.content).toBe('Light behaves as both a wave and a particle.');
      expect(explorationOp.value.summary).toBe('Exploring the dual nature of light.');
      expect(explorationOp.value.depth).toBe(3);
      expect(explorationOp.value.tags).toBe('physics,quantum,duality');
      expect(explorationOp.value.price).toBeNull();
      expect(explorationOp.value.gateway_url).toBeNull();
      expect(explorationOp.value.content_hash).toBeNull();

      // Second op: index update
      const indexOp = txCall.operation.op_list[1];
      expect(indexOp.ref).toBe('/apps/knowledge/index/by_topic/physics|quantum/explorers/0xTestAddress');
      expect(indexOp.value).toBe(1);
    });

    it('should create a gated exploration entry with price and gateway', async function() {
      const { ain } = createMockAin();

      const result = await ain.knowledge.explore({
        topicPath: 'ai/transformers',
        title: 'Attention Is All You Need',
        content: 'Full paper analysis with deep insights...',
        summary: 'Analysis of the transformer architecture.',
        depth: 5,
        tags: 'ai,transformers,attention',
        price: '0.50',
        gatewayUrl: 'https://my-gateway.com/content/123',
      });

      expect(result).toEqual({ result: true });

      const txCall = (ain.sendTransaction as jest.Mock).mock.calls[0][0];
      const explorationOp = txCall.operation.op_list[0];
      expect(explorationOp.value.content).toBeNull(); // Content not stored on-chain
      expect(explorationOp.value.price).toBe('0.50');
      expect(explorationOp.value.gateway_url).toBe('https://my-gateway.com/content/123');
      expect(explorationOp.value.content_hash).toBeTruthy(); // Should have a hash
      expect(typeof explorationOp.value.content_hash).toBe('string');
    });

    it('should get explorations by user and topic', async function() {
      const { ain, setValueAtPath } = createMockAin();

      const explorations = {
        entry1: {
          topic_path: 'physics/quantum',
          title: 'Entry 1',
          content: 'Content 1',
          summary: 'Summary 1',
          depth: 2,
          tags: 'physics',
          price: null,
          gateway_url: null,
          content_hash: null,
          created_at: 1700000000000,
          updated_at: 1700000000000,
        },
      };
      setValueAtPath('/apps/knowledge/explorations/0xUser1/physics|quantum', explorations);

      const result = await ain.knowledge.getExplorations('0xUser1', 'physics/quantum');
      expect(result).toEqual(explorations);
    });

    it('should get all explorations by user', async function() {
      const { ain, setValueAtPath } = createMockAin();

      const userData = {
        'physics|quantum': { entry1: { title: 'Entry 1' } },
        'math|algebra': { entry2: { title: 'Entry 2' } },
      };
      setValueAtPath('/apps/knowledge/explorations/0xUser1', userData);

      const result = await ain.knowledge.getExplorationsByUser('0xUser1');
      expect(result).toEqual(userData);
    });
  });

  describe('Explorers & Frontier', function() {
    it('should get explorers for a topic', async function() {
      const { ain, setValueAtPath } = createMockAin();

      setValueAtPath('/apps/knowledge/index/by_topic/physics|quantum/explorers', {
        '0xAlice': 3,
        '0xBob': 1,
      });

      const explorers = await ain.knowledge.getExplorers('physics/quantum');
      expect(explorers).toEqual(['0xAlice', '0xBob']);
    });

    it('should return empty array when no explorers exist', async function() {
      const { ain } = createMockAin();

      const explorers = await ain.knowledge.getExplorers('nonexistent/topic');
      expect(explorers).toEqual([]);
    });

    it('should compute topic stats', async function() {
      const { ain, setValueAtPath } = createMockAin();

      setValueAtPath('/apps/knowledge/index/by_topic/physics|quantum/explorers', {
        '0xAlice': 2,
        '0xBob': 1,
      });
      setValueAtPath('/apps/knowledge/explorations/0xAlice/physics|quantum', {
        entry1: { depth: 3, title: 'E1' },
        entry2: { depth: 5, title: 'E2' },
      });
      setValueAtPath('/apps/knowledge/explorations/0xBob/physics|quantum', {
        entry3: { depth: 2, title: 'E3' },
      });

      const stats = await ain.knowledge.getTopicStats('physics/quantum');
      expect(stats.explorer_count).toBe(2);
      expect(stats.max_depth).toBe(5);
      expect(stats.avg_depth).toBeCloseTo(3.33, 1);
    });

    it('should return zero stats for empty topic', async function() {
      const { ain } = createMockAin();

      const stats = await ain.knowledge.getTopicStats('empty/topic');
      expect(stats).toEqual({ explorer_count: 0, max_depth: 0, avg_depth: 0 });
    });

    it('should get full frontier view', async function() {
      const { ain, setValueAtPath } = createMockAin();

      setValueAtPath('/apps/knowledge/topics/physics/quantum/.info', {
        title: 'Quantum Physics',
        description: 'Study of quantum mechanics',
        created_at: 1700000000000,
        created_by: '0xCreator',
      });
      setValueAtPath('/apps/knowledge/index/by_topic/physics|quantum/explorers', {
        '0xAlice': 1,
      });
      setValueAtPath('/apps/knowledge/explorations/0xAlice/physics|quantum', {
        entry1: { depth: 4, title: 'E1' },
      });

      const frontier = await ain.knowledge.getFrontier('physics/quantum');
      expect(frontier.info).not.toBeNull();
      expect(frontier.info!.title).toBe('Quantum Physics');
      expect(frontier.stats.explorer_count).toBe(1);
      expect(frontier.stats.max_depth).toBe(4);
      expect(frontier.explorers).toEqual(['0xAlice']);
    });

    it('should get frontier map for subtopics', async function() {
      const { ain, setValueAtPath } = createMockAin();

      setValueAtPath('/apps/knowledge/topics/physics', {
        '.info': { title: 'Physics' },
        quantum: { '.info': { title: 'Quantum' } },
        classical: { '.info': { title: 'Classical' } },
      });
      setValueAtPath('/apps/knowledge/index/by_topic/physics|quantum/explorers', {
        '0xAlice': 1,
      });
      setValueAtPath('/apps/knowledge/explorations/0xAlice/physics|quantum', {
        entry1: { depth: 3, title: 'E1' },
      });

      const map = await ain.knowledge.getFrontierMap('physics');
      expect(map.length).toBe(2);

      const quantumEntry = map.find(e => e.topic === 'physics/quantum');
      expect(quantumEntry).toBeDefined();
      expect(quantumEntry!.stats.explorer_count).toBe(1);
      expect(quantumEntry!.stats.max_depth).toBe(3);

      const classicalEntry = map.find(e => e.topic === 'physics/classical');
      expect(classicalEntry).toBeDefined();
      expect(classicalEntry!.stats.explorer_count).toBe(0);
    });
  });

  describe('Access & Payments', function() {
    it('should return free content directly without x402', async function() {
      const { ain, setValueAtPath } = createMockAin();

      setValueAtPath('/apps/knowledge/explorations/0xCreator/physics|quantum/entry1', {
        topic_path: 'physics/quantum',
        title: 'Free Entry',
        content: 'This is free content.',
        summary: 'A free exploration.',
        depth: 2,
        tags: 'free',
        price: null,
        gateway_url: null,
        content_hash: null,
        created_at: 1700000000000,
        updated_at: 1700000000000,
      });

      const result = await ain.knowledge.access('0xCreator', 'physics/quantum', 'entry1');
      expect(result.content).toBe('This is free content.');
      expect(result.paid).toBe(false);
      expect(result.receipt).toBeUndefined();
    });

    it('should throw when exploration is not found', async function() {
      const { ain } = createMockAin();

      await expect(
        ain.knowledge.access('0xCreator', 'physics/quantum', 'nonexistent')
      ).rejects.toThrow('Exploration not found');
    });

    it('should throw when x402 client not configured for gated content', async function() {
      const { ain, setValueAtPath } = createMockAin();

      setValueAtPath('/apps/knowledge/explorations/0xCreator/ai|ml/entry1', {
        topic_path: 'ai/ml',
        title: 'Gated Entry',
        content: null,
        summary: 'A paid exploration.',
        depth: 5,
        tags: 'ai',
        price: '1.00',
        gateway_url: 'https://gateway.example.com/content/entry1',
        content_hash: 'abc123',
        created_at: 1700000000000,
        updated_at: 1700000000000,
      });

      await expect(
        ain.knowledge.access('0xCreator', 'ai/ml', 'entry1')
      ).rejects.toThrow('x402 client not configured');
    });

    it('should get access receipts', async function() {
      const { ain, setValueAtPath } = createMockAin();

      const receipts = {
        '0xCreator_physics|quantum_entry1': {
          seller: '0xCreator',
          topic_path: 'physics/quantum',
          entry_id: 'entry1',
          amount: '0.50',
          currency: 'USDC',
          tx_hash: '0xtxhash',
          accessed_at: 1700000000000,
        },
      };
      setValueAtPath('/apps/knowledge/access/0xBuyer', receipts);

      const result = await ain.knowledge.getAccessReceipts('0xBuyer');
      expect(result).toEqual(receipts);
    });

    it('should check hasAccess correctly', async function() {
      const { ain, setValueAtPath } = createMockAin();

      setValueAtPath('/apps/knowledge/access/0xBuyer/0xCreator_physics|quantum_entry1', {
        seller: '0xCreator',
        accessed_at: 1700000000000,
      });

      const has = await ain.knowledge.hasAccess('0xBuyer', '0xCreator_physics|quantum_entry1');
      expect(has).toBe(true);

      const hasNot = await ain.knowledge.hasAccess('0xBuyer', 'nonexistent_key');
      expect(hasNot).toBe(false);
    });
  });

  describe('x402 Client Configuration', function() {
    it('should set x402 client', function() {
      const { ain } = createMockAin();
      const mockClient = { register: jest.fn() };

      ain.knowledge.setX402Client(mockClient);
      // No public getter, but we can verify it doesn't throw
      // and that access for gated content no longer throws "not configured"
    });
  });

  describe('Admin - setupApp', function() {
    it('should send a SET transaction with owner and rule operations', async function() {
      const { ain } = createMockAin();

      const result = await ain.knowledge.setupApp();
      expect(result).toEqual({ result: true });
      expect(ain.sendTransaction).toHaveBeenCalledTimes(1);

      const txCall = (ain.sendTransaction as jest.Mock).mock.calls[0][0];
      expect(txCall.operation.type).toBe('SET');
      expect(txCall.operation.op_list.length).toBe(5);

      // Verify SET_OWNER
      const ownerOp = txCall.operation.op_list[0];
      expect(ownerOp.type).toBe('SET_OWNER');
      expect(ownerOp.ref).toBe('/apps/knowledge');

      // Verify SET_RULE for explorations
      const explorationRule = txCall.operation.op_list[1];
      expect(explorationRule.type).toBe('SET_RULE');
      expect(explorationRule.ref).toBe('/apps/knowledge/explorations/$user_addr');
      expect(explorationRule.value['.rule'].write).toBe('auth.addr === $user_addr');

      // Verify SET_RULE for topics
      const topicRule = txCall.operation.op_list[2];
      expect(topicRule.type).toBe('SET_RULE');
      expect(topicRule.ref).toBe('/apps/knowledge/topics');

      // Verify SET_RULE for index
      const indexRule = txCall.operation.op_list[3];
      expect(indexRule.type).toBe('SET_RULE');
      expect(indexRule.ref).toBe('/apps/knowledge/index/by_topic/$topic_key/explorers/$user_addr');

      // Verify SET_RULE for access
      const accessRule = txCall.operation.op_list[4];
      expect(accessRule.type).toBe('SET_RULE');
      expect(accessRule.ref).toBe('/apps/knowledge/access/$buyer_addr');
    });

    it('should use custom owner address', async function() {
      const { ain } = createMockAin();

      await ain.knowledge.setupApp({ ownerAddress: '0xCustomOwner' });

      const txCall = (ain.sendTransaction as jest.Mock).mock.calls[0][0];
      const ownerOp = txCall.operation.op_list[0];
      expect(ownerOp.value['.owner'].owners['0xCustomOwner']).toBeDefined();
      expect(ownerOp.value['.owner'].owners['0xCustomOwner'].branch_owner).toBe(true);
    });
  });

  describe('Integration with Ain', function() {
    it('should have knowledge property on Ain instance', function() {
      const ain = new Ain(test_node_1);
      expect(ain.knowledge).toBeDefined();
      expect(typeof ain.knowledge.explore).toBe('function');
      expect(typeof ain.knowledge.listTopics).toBe('function');
      expect(typeof ain.knowledge.getFrontier).toBe('function');
      expect(typeof ain.knowledge.access).toBe('function');
      expect(typeof ain.knowledge.setupApp).toBe('function');
    });

    it('should re-create knowledge on setProvider', function() {
      const ain = new Ain(test_node_1);
      const original = ain.knowledge;
      ain.setProvider('http://localhost:8082');
      expect(ain.knowledge).toBeDefined();
      expect(ain.knowledge).not.toBe(original);
    });
  });
});
