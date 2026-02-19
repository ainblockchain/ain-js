import Llm from '../src/llm/index';
import { ChatMessage, InferResult } from '../src/llm/types';

// Mock provider
function createMockProvider(response: any = {}) {
  return {
    send: jest.fn().mockResolvedValue(response),
  } as any;
}

describe('Llm', () => {
  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('should create a new Llm instance', () => {
      const provider = createMockProvider();
      const llm = new Llm(provider);
      expect(llm).toBeInstanceOf(Llm);
    });
  });

  // ---------------------------------------------------------------------------
  // infer
  // ---------------------------------------------------------------------------

  describe('infer', () => {
    it('should send ain_llm_infer with correct params', async () => {
      const provider = createMockProvider({
        content: 'Hello from LLM',
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
      const llm = new Llm(provider);

      const result = await llm.infer({
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 256,
        temperature: 0.5,
      });

      expect(provider.send).toHaveBeenCalledWith('ain_llm_infer', {
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 256,
        temperature: 0.5,
      });
      expect(result.content).toBe('Hello from LLM');
      expect(result.thinking).toBeNull();
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(5);
    });

    it('should pass through thinking field when present', async () => {
      const provider = createMockProvider({
        content: 'The answer',
        thinking: 'Let me reason step by step...',
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
      const llm = new Llm(provider);

      const result = await llm.infer({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.thinking).toBe('Let me reason step by step...');
    });

    it('should map snake_case usage to camelCase', async () => {
      const provider = createMockProvider({
        content: 'test',
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });
      const llm = new Llm(provider);

      const result = await llm.infer({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.usage.promptTokens).toBe(100);
      expect(result.usage.completionTokens).toBe(50);
    });

    it('should default usage to 0 when not present', async () => {
      const provider = createMockProvider({
        content: 'test',
      });
      const llm = new Llm(provider);

      const result = await llm.infer({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.usage.promptTokens).toBe(0);
      expect(result.usage.completionTokens).toBe(0);
    });

    it('should pass undefined maxTokens and temperature when not specified', async () => {
      const provider = createMockProvider({ content: 'test', usage: {} });
      const llm = new Llm(provider);

      await llm.infer({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(provider.send).toHaveBeenCalledWith('ain_llm_infer', {
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: undefined,
        temperature: undefined,
      });
    });

    it('should propagate provider errors', async () => {
      const provider = {
        send: jest.fn().mockRejectedValue(new Error('Network error')),
      } as any;
      const llm = new Llm(provider);

      await expect(
        llm.infer({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow('Network error');
    });
  });

  // ---------------------------------------------------------------------------
  // chat
  // ---------------------------------------------------------------------------

  describe('chat', () => {
    it('should return only the content string', async () => {
      const provider = createMockProvider({
        content: 'The answer is 42',
        usage: { prompt_tokens: 5, completion_tokens: 4 },
      });
      const llm = new Llm(provider);

      const response = await llm.chat([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'What is the meaning of life?' },
      ]);

      expect(response).toBe('The answer is 42');
      expect(typeof response).toBe('string');
    });

    it('should pass options to infer', async () => {
      const provider = createMockProvider({ content: 'response', usage: {} });
      const llm = new Llm(provider);

      await llm.chat(
        [{ role: 'user', content: 'test' }],
        { maxTokens: 512, temperature: 0.3 }
      );

      expect(provider.send).toHaveBeenCalledWith('ain_llm_infer', {
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 512,
        temperature: 0.3,
      });
    });

    it('should handle multi-turn conversation', async () => {
      const provider = createMockProvider({ content: 'Paris', usage: {} });
      const llm = new Llm(provider);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
        { role: 'user', content: 'What about Germany?' },
      ];

      const response = await llm.chat(messages);

      expect(response).toBe('Paris');
      expect(provider.send).toHaveBeenCalledWith('ain_llm_infer', expect.objectContaining({
        messages,
      }));
    });

    it('should work without options', async () => {
      const provider = createMockProvider({ content: 'ok', usage: {} });
      const llm = new Llm(provider);

      const response = await llm.chat([{ role: 'user', content: 'hi' }]);

      expect(response).toBe('ok');
      expect(provider.send).toHaveBeenCalledWith('ain_llm_infer', {
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: undefined,
        temperature: undefined,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // complete
  // ---------------------------------------------------------------------------

  describe('complete', () => {
    it('should convert a single prompt to a user message', async () => {
      const provider = createMockProvider({ content: 'completed text', usage: {} });
      const llm = new Llm(provider);

      const response = await llm.complete('What is a transformer?');

      expect(response).toBe('completed text');
      expect(provider.send).toHaveBeenCalledWith('ain_llm_infer', {
        messages: [{ role: 'user', content: 'What is a transformer?' }],
        max_tokens: undefined,
        temperature: undefined,
      });
    });

    it('should pass options through to chat', async () => {
      const provider = createMockProvider({ content: 'response', usage: {} });
      const llm = new Llm(provider);

      await llm.complete('test', { maxTokens: 100, temperature: 0.1 });

      expect(provider.send).toHaveBeenCalledWith('ain_llm_infer', {
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 100,
        temperature: 0.1,
      });
    });

    it('should propagate errors from chat', async () => {
      const provider = {
        send: jest.fn().mockRejectedValue(new Error('Server down')),
      } as any;
      const llm = new Llm(provider);

      await expect(llm.complete('test')).rejects.toThrow('Server down');
    });
  });
});
