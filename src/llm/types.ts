/**
 * A chat message with role and content.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Options for chat/inference calls.
 */
export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  thinking?: boolean;
}

/**
 * Input for the raw infer call.
 */
export interface InferInput {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

/**
 * Result from an inference call.
 */
export interface InferResult {
  content: string;
  thinking: string | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}
