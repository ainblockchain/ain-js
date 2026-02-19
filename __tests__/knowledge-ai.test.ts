/**
 * Tests for AI-powered methods on the Knowledge module:
 * aiExplore, aiGenerateCourse, aiAnalyze
 */

// We need to test the Knowledge class methods that use provider.send() for LLM calls.
// We'll mock the Ain instance and Provider.

const MOCK_ADDRESS = '0xTestAddress123';

function createMockAin() {
  const mockDbRef = {
    getValue: jest.fn().mockResolvedValue(null),
  };

  const mockDb = {
    ref: jest.fn().mockReturnValue(mockDbRef),
  };

  const mockSigner = {
    getAddress: jest.fn().mockReturnValue(MOCK_ADDRESS),
  };

  const mockProvider = {
    send: jest.fn().mockResolvedValue(null),
  };

  return {
    ain: {
      db: mockDb,
      signer: mockSigner,
      sendTransaction: jest.fn().mockResolvedValue({ tx_hash: 'mock_tx_hash' }),
    },
    provider: mockProvider,
    dbRef: mockDbRef,
  };
}

// We import Knowledge directly and construct it with mocks
import Knowledge from '../src/knowledge/index';

describe('Knowledge AI Methods', () => {
  let knowledge: Knowledge;
  let mockAin: ReturnType<typeof createMockAin>['ain'];
  let mockProvider: ReturnType<typeof createMockAin>['provider'];
  let mockDbRef: ReturnType<typeof createMockAin>['dbRef'];

  beforeEach(() => {
    const mocks = createMockAin();
    mockAin = mocks.ain;
    mockProvider = mocks.provider;
    mockDbRef = mocks.dbRef;
    knowledge = new Knowledge(mockAin as any, mockProvider as any);
  });

  // ---------------------------------------------------------------------------
  // aiExplore
  // ---------------------------------------------------------------------------

  describe('aiExplore', () => {
    it('should call ain_llm_explore then write exploration to chain', async () => {
      // Mock getFrontierMap: returns empty (no subtopics)
      // getFrontierMap calls listSubtopics/listTopics which calls db.ref().getValue()
      mockDbRef.getValue.mockResolvedValue(null);

      // Mock the LLM explore call
      mockProvider.send.mockResolvedValueOnce({
        title: 'Attention Mechanisms',
        content: 'Detailed content about attention...',
        summary: 'Overview of attention mechanisms',
        depth: 2,
        tags: 'attention,transformers',
      });

      const result = await knowledge.aiExplore('ai/transformers', {
        context: 'Test context',
        depth: 3,
      });

      // Verify provider.send was called with ain_llm_explore
      expect(mockProvider.send).toHaveBeenCalledWith('ain_llm_explore', expect.objectContaining({
        topic_path: 'ai/transformers',
        context: 'Test context',
      }));

      // Verify exploration was written via sendTransaction
      expect(mockAin.sendTransaction).toHaveBeenCalled();
      expect(result).toHaveProperty('entryId');
      expect(result).toHaveProperty('txResult');
      expect(result.thinking).toBeNull();
    });

    it('should pass through thinking from LLM response', async () => {
      mockDbRef.getValue.mockResolvedValue(null);

      mockProvider.send.mockResolvedValueOnce({
        title: 'T',
        content: 'C',
        summary: 'S',
        depth: 1,
        tags: '',
        thinking: 'I analyzed the topic and decided to focus on...',
      });

      const result = await knowledge.aiExplore('test/topic');
      expect(result.thinking).toBe('I analyzed the topic and decided to focus on...');
    });

    it('should use depth from options over LLM result', async () => {
      mockDbRef.getValue.mockResolvedValue(null);
      mockProvider.send.mockResolvedValueOnce({
        title: 'T',
        content: 'C',
        summary: 'S',
        depth: 1,
        tags: '',
      });

      await knowledge.aiExplore('test/topic', { depth: 4 });

      // The depth should be 4 (from options), not 1 (from LLM)
      const txCall = mockAin.sendTransaction.mock.calls[0][0];
      const opList = txCall.operation.op_list;
      // Find the exploration entry in the op_list
      const explorationOp = opList.find((op: any) =>
        op.ref.includes('/explorations/')
      );
      expect(explorationOp.value.depth).toBe(4);
    });

    it('should handle frontier map fetch failure gracefully', async () => {
      // Make db.ref().getValue() throw for frontier but succeed for other calls
      let callCount = 0;
      mockDbRef.getValue.mockImplementation(async () => {
        callCount++;
        if (callCount <= 1) {
          // First call is for listTopics in getFrontierMap — return null
          return null;
        }
        // Subsequent calls are for explore (index count etc.)
        return 0;
      });

      mockProvider.send.mockResolvedValueOnce({
        title: 'T',
        content: 'C',
        summary: 'S',
        depth: 1,
        tags: '',
      });

      // Should not throw even if frontier map is empty/fails
      const result = await knowledge.aiExplore('test/topic');
      expect(result).toHaveProperty('entryId');
    });

    it('should pass frontier data to LLM when available', async () => {
      // First call: listTopics returns topics
      mockDbRef.getValue
        .mockResolvedValueOnce({ 'sub1': {} }) // listTopics/listSubtopics
        .mockResolvedValueOnce(null) // getTopicStats explorers
        .mockResolvedValueOnce(0) // currentCount for explore
        .mockResolvedValue(null); // remaining

      mockProvider.send.mockResolvedValueOnce({
        title: 'T',
        content: 'C',
        summary: 'S',
        depth: 1,
        tags: '',
      });

      await knowledge.aiExplore('ai/transformers');

      const sendCall = mockProvider.send.mock.calls[0];
      expect(sendCall[0]).toBe('ain_llm_explore');
      expect(sendCall[1].topic_path).toBe('ai/transformers');
    });
  });

  // ---------------------------------------------------------------------------
  // aiGenerateCourse
  // ---------------------------------------------------------------------------

  describe('aiGenerateCourse', () => {
    it('should call ain_llm_generateCourse and return stages', async () => {
      const mockStages = [
        { title: 'Stage 1', content: 'Intro content', exercise: 'What is...?' },
        { title: 'Stage 2', content: 'Advanced content', exercise: 'Explain...' },
      ];

      mockProvider.send.mockResolvedValue({ stages: mockStages });

      const explorations = [
        { topic_path: 'ai/transformers', title: 'Attention', summary: 'Overview', depth: 1, content: 'Full content', created_at: 0, updated_at: 0 },
        { topic_path: 'ai/transformers', title: 'Multi-Head', summary: 'Deep dive', depth: 2, content: 'Content 2', created_at: 0, updated_at: 0 },
      ] as any[];

      const result = await knowledge.aiGenerateCourse('ai/transformers', explorations);

      expect(mockProvider.send).toHaveBeenCalledWith('ain_llm_generateCourse', {
        topic_path: 'ai/transformers',
        explorations: expect.arrayContaining([
          expect.objectContaining({ title: 'Attention', depth: 1 }),
          expect.objectContaining({ title: 'Multi-Head', depth: 2 }),
        ]),
      });

      expect(result.stages).toHaveLength(2);
      expect(result.stages[0].title).toBe('Stage 1');
      expect(result.stages[1].exercise).toBe('Explain...');
      expect(result.thinking).toBeNull();
    });

    it('should return empty array when stages is undefined', async () => {
      mockProvider.send.mockResolvedValue({});

      const result = await knowledge.aiGenerateCourse('test', []);
      expect(result.stages).toEqual([]);
      expect(result.thinking).toBeNull();
    });

    it('should map exploration fields correctly', async () => {
      mockProvider.send.mockResolvedValue({ stages: [] });

      const explorations = [
        {
          topic_path: 'test',
          title: 'My Exploration',
          summary: 'My Summary',
          depth: 3,
          content: 'Full content text',
          created_at: 1000,
          updated_at: 2000,
          tags: 'tag1,tag2',
          price: '0.01',
        },
      ] as any[];

      await knowledge.aiGenerateCourse('test', explorations);

      const sentExplorations = mockProvider.send.mock.calls[0][1].explorations;
      expect(sentExplorations[0]).toEqual({
        title: 'My Exploration',
        summary: 'My Summary',
        depth: 3,
        content: 'Full content text',
      });
      // Should NOT include price, tags, created_at etc.
      expect(sentExplorations[0]).not.toHaveProperty('price');
      expect(sentExplorations[0]).not.toHaveProperty('tags');
    });

    it('should pass through thinking from LLM response', async () => {
      mockProvider.send.mockResolvedValue({
        stages: [{ title: 'S1', content: 'C', exercise: 'E' }],
        thinking: 'I designed a progressive curriculum starting from basics...',
      });

      const result = await knowledge.aiGenerateCourse('test', []);
      expect(result.stages).toHaveLength(1);
      expect(result.thinking).toBe('I designed a progressive curriculum starting from basics...');
    });
  });

  // ---------------------------------------------------------------------------
  // aiAnalyze
  // ---------------------------------------------------------------------------

  describe('aiAnalyze', () => {
    it('should fetch graph nodes and call ain_llm_analyze', async () => {
      // Mock getGraphNode calls
      const node1 = { address: '0x1', topic_path: 'ai/transformers', entry_id: 'e1', title: 'Node1', depth: 1, created_at: 1000 };
      const node2 = { address: '0x2', topic_path: 'ai/transformers', entry_id: 'e2', title: 'Node2', depth: 2, created_at: 2000 };

      mockDbRef.getValue
        .mockResolvedValueOnce(node1) // getGraphNode call 1
        .mockResolvedValueOnce(node2); // getGraphNode call 2

      mockProvider.send.mockResolvedValue({
        content: 'Transformers use self-attention to process sequences in parallel.',
        thinking: 'Let me analyze the context nodes about transformers...',
      });

      const result = await knowledge.aiAnalyze(
        'How do transformers work?',
        ['nodeId1', 'nodeId2']
      );

      expect(result.content).toBe('Transformers use self-attention to process sequences in parallel.');
      expect(result.thinking).toBe('Let me analyze the context nodes about transformers...');

      expect(mockProvider.send).toHaveBeenCalledWith('ain_llm_analyze', {
        question: 'How do transformers work?',
        context_nodes: [node1, node2],
      });
    });

    it('should skip null graph nodes', async () => {
      mockDbRef.getValue
        .mockResolvedValueOnce({ address: '0x1', title: 'Valid', depth: 1 })
        .mockResolvedValueOnce(null) // This node doesn't exist
        .mockResolvedValueOnce({ address: '0x3', title: 'Also Valid', depth: 2 });

      mockProvider.send.mockResolvedValue({ content: 'Analysis', thinking: null });

      await knowledge.aiAnalyze('question', ['id1', 'id2', 'id3']);

      const sentNodes = mockProvider.send.mock.calls[0][1].context_nodes;
      expect(sentNodes).toHaveLength(2);
      expect(sentNodes[0].title).toBe('Valid');
      expect(sentNodes[1].title).toBe('Also Valid');
    });

    it('should work with empty context node IDs', async () => {
      mockProvider.send.mockResolvedValue({ content: 'No context analysis', thinking: null });

      const result = await knowledge.aiAnalyze('What is AI?', []);

      expect(result.content).toBe('No context analysis');
      expect(result.thinking).toBeNull();
      expect(mockProvider.send).toHaveBeenCalledWith('ain_llm_analyze', {
        question: 'What is AI?',
        context_nodes: [],
      });
    });

    it('should handle legacy string response from older nodes', async () => {
      // Older nodes may return a plain string instead of { content, thinking }
      mockProvider.send.mockResolvedValue('Plain string response');

      const result = await knowledge.aiAnalyze('What is AI?', []);

      expect(result.content).toBe('Plain string response');
      expect(result.thinking).toBeNull();
    });

    it('should propagate errors from provider.send', async () => {
      mockDbRef.getValue.mockResolvedValue(null);
      mockProvider.send.mockRejectedValue(new Error('LLM failed'));

      await expect(
        knowledge.aiAnalyze('question', [])
      ).rejects.toThrow('LLM failed');
    });
  });
});
