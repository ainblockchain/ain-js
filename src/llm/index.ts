import Provider from '../provider';
import { ChatMessage, ChatOptions, InferInput, InferResult } from './types';

/**
 * A class for the LLM module of AIN blockchain.
 * Provides chat inference through the AIN node's built-in vLLM integration.
 */
export default class Llm {
  private _provider: Provider;

  /**
   * Creates a new Llm object.
   * @param {Provider} provider The network provider object.
   */
  constructor(provider: Provider) {
    this._provider = provider;
  }

  /**
   * Raw inference: sends messages to the LLM via the AIN node.
   * @param {InferInput} params The inference input.
   * @returns {Promise<InferResult>} The inference result.
   */
  async infer(params: InferInput): Promise<InferResult> {
    const result = await this._provider.send('ain_llm_infer', {
      messages: params.messages,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
    });
    return {
      content: result.content,
      usage: {
        promptTokens: result.usage?.prompt_tokens || 0,
        completionTokens: result.usage?.completion_tokens || 0,
      },
    };
  }

  /**
   * Chat: sends an array of messages and returns the assistant's response string.
   * @param {ChatMessage[]} messages The chat messages.
   * @param {ChatOptions} options Optional chat options.
   * @returns {Promise<string>} The assistant's response content.
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const result = await this.infer({
      messages,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    });
    return result.content;
  }

  /**
   * Convenience: single prompt to response.
   * @param {string} prompt The user prompt.
   * @param {ChatOptions} options Optional chat options.
   * @returns {Promise<string>} The assistant's response content.
   */
  async complete(prompt: string, options?: ChatOptions): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }
}
