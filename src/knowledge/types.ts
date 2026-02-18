/**
 * Depth level for an exploration entry (1-5).
 */
export type ExplorationDepth = 1 | 2 | 3 | 4 | 5;

/**
 * An interface for topic metadata stored on-chain.
 */
export interface TopicInfo {
  title: string;
  description: string;
  created_at: number;
  created_by: string;
}

/**
 * An interface for an exploration entry stored on-chain.
 */
export interface Exploration {
  topic_path: string;
  title: string;
  content: string | null;
  summary: string;
  depth: ExplorationDepth;
  tags: string | null;
  price: string | null;
  gateway_url: string | null;
  content_hash: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * An interface for the input when creating a new exploration.
 */
export interface ExploreInput {
  topicPath: string;
  title: string;
  content: string;
  summary: string;
  depth: ExplorationDepth;
  tags: string;
  price?: string | null;
  gatewayUrl?: string | null;
}

/**
 * An interface for topic statistics.
 */
export interface TopicStats {
  explorer_count: number;
  max_depth: number;
  avg_depth: number;
}

/**
 * An interface for a topic's frontier view.
 */
export interface TopicFrontier {
  info: TopicInfo | null;
  stats: TopicStats;
  explorers: string[];
}

/**
 * An interface for per-subtopic stats in a frontier map.
 */
export interface FrontierMapEntry {
  topic: string;
  stats: TopicStats;
}

/**
 * An interface for an explorer's summary within a topic.
 */
export interface ExplorerTopicSummary {
  address: string;
  count: number;
}

/**
 * An interface for an access receipt (payment proof) stored on-chain.
 */
export interface AccessReceipt {
  seller: string;
  topic_path: string;
  entry_id: string;
  amount: string;
  currency: string;
  tx_hash: string;
  accessed_at: number;
}

/**
 * An interface for transaction options used by Knowledge methods.
 */
export interface KnowledgeTxOptions {
  nonce?: number;
  address?: string;
  gas_price?: number;
}

/**
 * An interface for the result of an access() call.
 */
export interface AccessResult {
  content: string;
  paid: boolean;
  receipt?: AccessReceipt;
}

/**
 * An interface for setupApp options.
 */
export interface SetupAppOptions extends KnowledgeTxOptions {
  ownerAddress?: string;
}
