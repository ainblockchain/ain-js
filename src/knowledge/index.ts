import Ain from '../ain';
import Provider from '../provider';
import { SetOperation, TransactionInput } from '../types';
import { PushId } from '../ain-db/push-id';
import {
  TopicInfo,
  Exploration,
  ExploreInput,
  ExploreResult,
  TopicStats,
  TopicFrontier,
  FrontierMapEntry,
  AccessReceipt,
  AccessResult,
  KnowledgeTxOptions,
  SetupAppOptions,
  PublishCourseInput,
  PublishCourseResult,
  GraphNode,
  GraphEdge,
  EntryRef,
} from './types';

const APP_PATH = '/apps/knowledge';

/**
 * Converts a topic path like "physics/quantum" to a key like "physics|quantum".
 */
function topicPathToKey(topicPath: string): string {
  return topicPath.replace(/\//g, '|');
}

/**
 * Converts a topic key like "physics|quantum" back to a path like "physics/quantum".
 */
function topicKeyToPath(topicKey: string): string {
  return topicKey.replace(/\|/g, '/');
}

/**
 * Computes a SHA-256 hash of the given content string.
 */
async function hashContent(content: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js fallback
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Builds a unique graph node ID from an entry reference.
 */
function buildNodeId(address: string, topicPath: string, entryId: string): string {
  const topicKey = topicPathToKey(topicPath);
  return `${address}_${topicKey}_${entryId}`;
}

/**
 * A class for the Knowledge module of AIN blockchain.
 * Allows users to explore, discover, and access knowledge entries on-chain,
 * with optional x402 payment gating for monetized content.
 */
export default class Knowledge {
  private _ain: Ain;
  private _provider: Provider;
  private _x402Client: any | null;

  /**
   * Creates a new Knowledge object.
   * @param {Ain} ain The Ain object.
   * @param {Provider} provider The network provider object.
   */
  constructor(ain: Ain, provider: Provider) {
    this._ain = ain;
    this._provider = provider;
    this._x402Client = null;
  }

  // ---------------------------------------------------------------------------
  // x402 Client Configuration
  // ---------------------------------------------------------------------------

  /**
   * Configures the x402 client used for paying to access gated content.
   * @param {any} client An x402Client instance (from @x402/fetch).
   */
  setX402Client(client: any): void {
    this._x402Client = client;
  }

  // ---------------------------------------------------------------------------
  // Explore (write your understanding)
  // ---------------------------------------------------------------------------

  /**
   * Records an exploration entry on-chain. If a price and gatewayUrl are provided,
   * the content is gated (stored off-chain behind x402); only metadata is on-chain.
   * @param {ExploreInput} input The exploration input.
   * @param {KnowledgeTxOptions} options Transaction options.
   * @returns {Promise<ExploreResult>} The entry ID and transaction result.
   */
  async explore(input: ExploreInput, options?: KnowledgeTxOptions): Promise<ExploreResult> {
    const address = this._ain.signer.getAddress(options?.address);
    const topicKey = topicPathToKey(input.topicPath);
    const entryId = PushId.generate();
    const now = Date.now();

    const isGated = !!input.price && !!input.gatewayUrl;
    const contentHash = isGated ? await hashContent(input.content) : null;

    const exploration: Exploration = {
      topic_path: input.topicPath,
      title: input.title,
      content: isGated ? null : input.content,
      summary: input.summary,
      depth: input.depth,
      tags: input.tags || null,
      price: input.price || null,
      gateway_url: input.gatewayUrl || null,
      content_hash: isGated ? contentHash : null,
      created_at: now,
      updated_at: now,
    };

    const explorationPath = `${APP_PATH}/explorations/${address}/${topicKey}/${entryId}`;
    const indexPath = `${APP_PATH}/index/by_topic/${topicKey}/explorers/${address}`;

    // Get current count for this explorer on this topic
    const currentCount = await this._ain.db.ref(indexPath).getValue() || 0;

    // Build graph node
    const nodeId = buildNodeId(address, input.topicPath, entryId);
    const graphNode: GraphNode = {
      address,
      topic_path: input.topicPath,
      entry_id: entryId,
      title: input.title,
      depth: input.depth,
      created_at: now,
    };

    const op_list: SetOperation[] = [
      {
        type: 'SET_VALUE',
        ref: explorationPath,
        value: exploration,
      },
      {
        type: 'SET_VALUE',
        ref: indexPath,
        value: currentCount + 1,
      },
      // Write graph node
      {
        type: 'SET_VALUE',
        ref: `${APP_PATH}/graph/nodes/${nodeId}`,
        value: graphNode,
      },
    ];

    // Build graph edges from parent and related entries
    if (input.parentEntry) {
      const parentNodeId = buildNodeId(
        input.parentEntry.ownerAddress,
        input.parentEntry.topicPath,
        input.parentEntry.entryId
      );
      const edge: GraphEdge = {
        type: 'extends',
        created_at: now,
        created_by: address,
      };
      op_list.push({
        type: 'SET_VALUE',
        ref: `${APP_PATH}/graph/edges/${nodeId}/${parentNodeId}`,
        value: edge,
      });
      // Reverse index for lookups
      op_list.push({
        type: 'SET_VALUE',
        ref: `${APP_PATH}/graph/edges/${parentNodeId}/${nodeId}`,
        value: { ...edge, type: 'extends' as const },
      });
    }

    if (input.relatedEntries) {
      for (let i = 0; i < input.relatedEntries.length; i++) {
        const rel = input.relatedEntries[i];
        const relNodeId = buildNodeId(rel.ownerAddress, rel.topicPath, rel.entryId);
        const edgeType = rel.type || 'related';
        const edge: GraphEdge = {
          type: edgeType,
          created_at: now,
          created_by: address,
        };
        op_list.push({
          type: 'SET_VALUE',
          ref: `${APP_PATH}/graph/edges/${nodeId}/${relNodeId}`,
          value: edge,
        });
        // Reverse index
        op_list.push({
          type: 'SET_VALUE',
          ref: `${APP_PATH}/graph/edges/${relNodeId}/${nodeId}`,
          value: edge,
        });
      }
    }

    const txInput: TransactionInput = {
      operation: {
        type: 'SET',
        op_list,
      },
      ...this._buildTxOptions(options),
    };

    const txResult = await this._ain.sendTransaction(txInput);
    return { entryId, nodeId, txResult };
  }

  /**
   * Convenience method: publishes a gated course in one call.
   * 1. POSTs content to the gateway server
   * 2. Calls explore() with price + gatewayUrl (stores metadata on-chain)
   * @param {PublishCourseInput} input The course input.
   * @param {KnowledgeTxOptions} options Transaction options.
   * @returns {Promise<PublishCourseResult>}
   */
  async publishCourse(input: PublishCourseInput, options?: KnowledgeTxOptions): Promise<PublishCourseResult> {
    const address = this._ain.signer.getAddress(options?.address);

    // Step 1: Upload content to gateway
    const publishRes = await globalThis.fetch(`${input.gatewayBaseUrl}/api/knowledge/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: input.content,
        title: input.title,
        price: input.price,
        payTo: address,
        description: input.summary,
      }),
    });

    if (!publishRes.ok) {
      const errText = await publishRes.text();
      throw new Error(`[ain-js.knowledge.publishCourse] Gateway publish failed: ${publishRes.status} ${errText}`);
    }

    const publishData = await publishRes.json();
    const contentId: string = publishData.contentId;
    const gatewayUrl = `${input.gatewayBaseUrl}/api/knowledge/content/${contentId}`;

    // Step 2: Record gated exploration on-chain (with graph edges)
    const { entryId, nodeId, txResult } = await this.explore(
      {
        topicPath: input.topicPath,
        title: input.title,
        content: input.content,
        summary: input.summary,
        depth: input.depth,
        tags: input.tags,
        price: input.price,
        gatewayUrl,
        parentEntry: input.parentEntry || null,
        relatedEntries: input.relatedEntries || null,
      },
      options,
    );

    return { contentId, gatewayUrl, entryId, txResult };
  }

  /**
   * Configures an AIN-token x402 client for local testnet payments.
   * After calling this, access() will auto-pay using AIN transfers.
   */
  setupAinX402Client(): void {
    const { AinTransferSchemeClient } = require('./ain-x402-client');
    const client = new AinTransferSchemeClient(this._ain);
    this.setX402Client(client);
  }

  /**
   * Gets all exploration entries by a user for a specific topic.
   * @param {string} address The user's address.
   * @param {string} topicPath The topic path (e.g. "physics/quantum").
   * @returns {Promise<Record<string, Exploration> | null>}
   */
  async getExplorations(address: string, topicPath: string): Promise<Record<string, Exploration> | null> {
    const topicKey = topicPathToKey(topicPath);
    const path = `${APP_PATH}/explorations/${address}/${topicKey}`;
    return this._ain.db.ref(path).getValue();
  }

  /**
   * Gets all exploration entries by a user across all topics.
   * @param {string} address The user's address.
   * @returns {Promise<Record<string, Record<string, Exploration>> | null>}
   */
  async getExplorationsByUser(address: string): Promise<Record<string, Record<string, Exploration>> | null> {
    const path = `${APP_PATH}/explorations/${address}`;
    return this._ain.db.ref(path).getValue();
  }

  // ---------------------------------------------------------------------------
  // Discover (browse what exists)
  // ---------------------------------------------------------------------------

  /**
   * Lists top-level topic categories.
   * @returns {Promise<string[]>} An array of top-level category names.
   */
  async listTopics(): Promise<string[]> {
    const path = `${APP_PATH}/topics`;
    const data = await this._ain.db.ref(path).getValue();
    if (!data) return [];
    return Object.keys(data);
  }

  /**
   * Lists subtopics under a given topic path.
   * @param {string} topicPath The topic path (e.g. "physics").
   * @returns {Promise<string[]>} An array of subtopic names.
   */
  async listSubtopics(topicPath: string): Promise<string[]> {
    const dbPath = `${APP_PATH}/topics/${topicPath}`;
    const data = await this._ain.db.ref(dbPath).getValue();
    if (!data) return [];
    return Object.keys(data).filter(k => k !== '.info');
  }

  /**
   * Gets the metadata for a specific topic.
   * @param {string} topicPath The topic path (e.g. "physics/quantum").
   * @returns {Promise<TopicInfo | null>}
   */
  async getTopicInfo(topicPath: string): Promise<TopicInfo | null> {
    const path = `${APP_PATH}/topics/${topicPath}/.info`;
    return this._ain.db.ref(path).getValue();
  }

  /**
   * Registers a new topic on-chain with metadata.
   * @param {string} topicPath The topic path (e.g. "physics/quantum").
   * @param {Pick<TopicInfo, 'title' | 'description'>} info The topic title and description.
   * @param {KnowledgeTxOptions} options Transaction options.
   * @returns {Promise<any>} The transaction result.
   */
  async registerTopic(
    topicPath: string,
    info: Pick<TopicInfo, 'title' | 'description'>,
    options?: KnowledgeTxOptions
  ): Promise<any> {
    const address = this._ain.signer.getAddress(options?.address);
    const topicInfo: TopicInfo = {
      title: info.title,
      description: info.description,
      created_at: Date.now(),
      created_by: address,
    };

    const path = `${APP_PATH}/topics/${topicPath}/.info`;
    const txInput: TransactionInput = {
      operation: {
        type: 'SET_VALUE',
        ref: path,
        value: topicInfo,
      },
      ...this._buildTxOptions(options),
    };

    return this._ain.sendTransaction(txInput);
  }

  /**
   * Gets the list of addresses that have explored a given topic.
   * @param {string} topicPath The topic path.
   * @returns {Promise<string[]>} An array of explorer addresses.
   */
  async getExplorers(topicPath: string): Promise<string[]> {
    const topicKey = topicPathToKey(topicPath);
    const path = `${APP_PATH}/index/by_topic/${topicKey}/explorers`;
    const data = await this._ain.db.ref(path).getValue();
    if (!data) return [];
    return Object.keys(data);
  }

  // ---------------------------------------------------------------------------
  // Knowledge Graph
  // ---------------------------------------------------------------------------

  /**
   * Gets a graph node by its ID.
   * @param {string} nodeId The node ID (format: address_topicKey_entryId).
   * @returns {Promise<GraphNode | null>}
   */
  async getGraphNode(nodeId: string): Promise<GraphNode | null> {
    const path = `${APP_PATH}/graph/nodes/${nodeId}`;
    return this._ain.db.ref(path).getValue();
  }

  /**
   * Gets all edges connected to a node.
   * @param {string} nodeId The node ID.
   * @returns {Promise<Record<string, GraphEdge> | null>} Map of targetNodeId -> edge.
   */
  async getNodeEdges(nodeId: string): Promise<Record<string, GraphEdge> | null> {
    const path = `${APP_PATH}/graph/edges/${nodeId}`;
    return this._ain.db.ref(path).getValue();
  }

  /**
   * Gets the full knowledge graph: all nodes and edges.
   * @returns {Promise<{ nodes: Record<string, GraphNode>; edges: Record<string, Record<string, GraphEdge>> }>}
   */
  async getGraph(): Promise<{
    nodes: Record<string, GraphNode>;
    edges: Record<string, Record<string, GraphEdge>>;
  }> {
    const [nodes, edges] = await Promise.all([
      this._ain.db.ref(`${APP_PATH}/graph/nodes`).getValue(),
      this._ain.db.ref(`${APP_PATH}/graph/edges`).getValue(),
    ]);
    return {
      nodes: nodes || {},
      edges: edges || {},
    };
  }

  /**
   * Builds a node ID from an entry reference.
   * Useful for looking up graph data for a known entry.
   */
  buildNodeId(address: string, topicPath: string, entryId: string): string {
    return buildNodeId(address, topicPath, entryId);
  }

  // ---------------------------------------------------------------------------
  // Frontier (see how far exploration has gone)
  // ---------------------------------------------------------------------------

  /**
   * Gets a full frontier view for a topic: info, stats, and explorer list.
   * @param {string} topicPath The topic path.
   * @returns {Promise<TopicFrontier>}
   */
  async getFrontier(topicPath: string): Promise<TopicFrontier> {
    const [info, stats, explorers] = await Promise.all([
      this.getTopicInfo(topicPath),
      this.getTopicStats(topicPath),
      this.getExplorers(topicPath),
    ]);
    return { info, stats, explorers };
  }

  /**
   * Gets statistics for a topic (explorer count, max depth, average depth).
   * @param {string} topicPath The topic path.
   * @returns {Promise<TopicStats>}
   */
  async getTopicStats(topicPath: string): Promise<TopicStats> {
    const topicKey = topicPathToKey(topicPath);
    const explorersPath = `${APP_PATH}/index/by_topic/${topicKey}/explorers`;
    const explorersData = await this._ain.db.ref(explorersPath).getValue();

    if (!explorersData) {
      return { explorer_count: 0, max_depth: 0, avg_depth: 0 };
    }

    const addresses = Object.keys(explorersData);
    const explorerCount = addresses.length;

    // Collect depths from all explorations for this topic
    const depths: number[] = [];
    for (const addr of addresses) {
      const explorations = await this.getExplorations(addr, topicPath);
      if (explorations) {
        for (const entry of Object.values(explorations)) {
          if (entry && typeof entry.depth === 'number') {
            depths.push(entry.depth);
          }
        }
      }
    }

    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
    const avgDepth = depths.length > 0
      ? Math.round((depths.reduce((a, b) => a + b, 0) / depths.length) * 100) / 100
      : 0;

    return { explorer_count: explorerCount, max_depth: maxDepth, avg_depth: avgDepth };
  }

  /**
   * Gets a frontier map: stats per subtopic for a bird's-eye view.
   * @param {string} topicPath Optional topic path. If omitted, returns stats for all top-level topics.
   * @returns {Promise<FrontierMapEntry[]>}
   */
  async getFrontierMap(topicPath?: string): Promise<FrontierMapEntry[]> {
    const subtopics = topicPath
      ? await this.listSubtopics(topicPath)
      : await this.listTopics();

    const entries: FrontierMapEntry[] = [];
    for (const sub of subtopics) {
      const fullPath = topicPath ? `${topicPath}/${sub}` : sub;
      const stats = await this.getTopicStats(fullPath);
      entries.push({ topic: fullPath, stats });
    }
    return entries;
  }

  // ---------------------------------------------------------------------------
  // Access & Payments (x402 integration)
  // ---------------------------------------------------------------------------

  /**
   * Access a gated exploration entry. If the entry has a price and gateway_url,
   * uses x402 to pay for and retrieve the full content. Records an access receipt on-chain.
   * @param {string} ownerAddress The creator's address.
   * @param {string} topicPath The topic path.
   * @param {string} entryId The exploration entry ID.
   * @param {KnowledgeTxOptions} options Transaction options.
   * @returns {Promise<AccessResult>}
   */
  async access(
    ownerAddress: string,
    topicPath: string,
    entryId: string,
    options?: KnowledgeTxOptions
  ): Promise<AccessResult> {
    const topicKey = topicPathToKey(topicPath);
    const explorationPath = `${APP_PATH}/explorations/${ownerAddress}/${topicKey}/${entryId}`;
    const exploration: Exploration | null = await this._ain.db.ref(explorationPath).getValue();

    if (!exploration) {
      throw new Error(`[ain-js.knowledge.access] Exploration not found at ${explorationPath}`);
    }

    // Free content — return directly
    if (!exploration.price || !exploration.gateway_url) {
      return {
        content: exploration.content || '',
        paid: false,
      };
    }

    // Gated content — x402 flow: request → 402 → pay → retry with proof
    if (!this._x402Client) {
      throw new Error(
        '[ain-js.knowledge.access] x402 client not configured. Call setX402Client() or setupAinX402Client() first.'
      );
    }

    // Step 1: Request content (expect 402)
    const initialResponse = await globalThis.fetch(exploration.gateway_url);

    let content: string;
    let txHash = '';
    let currency = 'AIN';

    if (initialResponse.status === 402) {
      // Step 2: Parse payment requirements from 402 response
      const paymentRequiredHeader = initialResponse.headers.get('x-payment-required');
      let paymentRequirements: any;

      if (paymentRequiredHeader) {
        try {
          const decoded = Buffer.from(paymentRequiredHeader, 'base64').toString('utf-8');
          paymentRequirements = JSON.parse(decoded);
        } catch {
          paymentRequirements = JSON.parse(paymentRequiredHeader);
        }
      } else {
        // Fallback: parse from response body
        const body = await initialResponse.json();
        paymentRequirements = body.requirements;
      }

      // Step 3: Execute payment via the x402 client
      const paymentResult = await this._x402Client.handlePaymentRequired(
        paymentRequirements,
        initialResponse
      );

      txHash = paymentResult.payload?.txHash || '';
      currency = paymentResult.payload?.scheme === 'ain-transfer' ? 'AIN' : 'USDC';

      // Step 4: Retry request with payment proof
      const paymentPayload = Buffer.from(JSON.stringify(paymentResult.payload)).toString('base64');
      const paidResponse = await globalThis.fetch(exploration.gateway_url, {
        headers: { 'X-PAYMENT': paymentPayload },
      });

      if (!paidResponse.ok) {
        const errText = await paidResponse.text();
        throw new Error(
          `[ain-js.knowledge.access] Payment accepted but content retrieval failed: ${paidResponse.status} ${errText}`
        );
      }

      content = await paidResponse.text();
      txHash = paidResponse.headers?.get?.('x-payment-tx-hash') || txHash;
      currency = paidResponse.headers?.get?.('x-payment-currency') || currency;
    } else if (initialResponse.ok) {
      // Content was free or already paid
      content = await initialResponse.text();
    } else {
      throw new Error(
        `[ain-js.knowledge.access] Failed to fetch gated content: ${initialResponse.status} ${initialResponse.statusText}`
      );
    }

    // Verify content hash if available
    if (exploration.content_hash) {
      const computedHash = await hashContent(content);
      if (computedHash !== exploration.content_hash) {
        throw new Error(
          '[ain-js.knowledge.access] Content hash mismatch. The served content does not match the on-chain hash.'
        );
      }
    }

    // Record access receipt on-chain
    const buyerAddress = this._ain.signer.getAddress(options?.address);
    const entryKey = `${ownerAddress}_${topicKey}_${entryId}`;

    const receipt: AccessReceipt = {
      seller: ownerAddress,
      topic_path: topicPath,
      entry_id: entryId,
      amount: exploration.price,
      currency,
      tx_hash: txHash,
      accessed_at: Date.now(),
    };

    const receiptPath = `${APP_PATH}/access/${buyerAddress}/${entryKey}`;
    await this._ain.sendTransaction({
      operation: {
        type: 'SET_VALUE',
        ref: receiptPath,
        value: receipt,
      },
      ...this._buildTxOptions(options),
    });

    return { content, paid: true, receipt };
  }

  /**
   * Gets all access receipts for a buyer.
   * @param {string} buyerAddress The buyer's address.
   * @returns {Promise<Record<string, AccessReceipt> | null>}
   */
  async getAccessReceipts(buyerAddress: string): Promise<Record<string, AccessReceipt> | null> {
    const path = `${APP_PATH}/access/${buyerAddress}`;
    return this._ain.db.ref(path).getValue();
  }

  /**
   * Checks if a buyer has already paid for a specific entry.
   * @param {string} buyerAddress The buyer's address.
   * @param {string} entryKey The entry key (format: ownerAddress_topicKey_entryId).
   * @returns {Promise<boolean>}
   */
  async hasAccess(buyerAddress: string, entryKey: string): Promise<boolean> {
    const path = `${APP_PATH}/access/${buyerAddress}/${entryKey}`;
    const receipt = await this._ain.db.ref(path).getValue();
    return receipt !== null;
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  /**
   * One-time setup: registers the "knowledge" app via /manage_app, then sets
   * write rules and owner permissions on /apps/knowledge.
   * @param {SetupAppOptions} options Setup options.
   * @returns {Promise<any>} The transaction result for the rules/owner setup.
   */
  async setupApp(options?: SetupAppOptions): Promise<any> {
    const address = this._ain.signer.getAddress(options?.address);
    const ownerAddress = options?.ownerAddress || address;

    // Step 1: Register the app via /manage_app
    const createAppResult = await this._ain.sendTransaction({
      operation: {
        type: 'SET_VALUE',
        ref: `/manage_app/knowledge/create/${Date.now()}`,
        value: { admin: { [ownerAddress]: true } },
      },
      ...this._buildTxOptions(options),
    });

    // Step 2: Set rules and owner permissions
    const op_list: SetOperation[] = [
      // Set owner permissions
      {
        type: 'SET_OWNER',
        ref: APP_PATH,
        value: {
          '.owner': {
            owners: {
              [ownerAddress]: {
                branch_owner: true,
                write_function: true,
                write_owner: true,
                write_rule: true,
              },
            },
          },
        },
      },
      // Write rules for explorations: only the user can write to their own path
      {
        type: 'SET_RULE',
        ref: `${APP_PATH}/explorations/$user_addr`,
        value: {
          '.rule': {
            write: 'auth.addr === $user_addr',
          },
        },
      },
      // Write rules for topics: any authenticated user can write
      {
        type: 'SET_RULE',
        ref: `${APP_PATH}/topics`,
        value: {
          '.rule': {
            write: "auth.addr !== ''",
          },
        },
      },
      // Write rules for index: only the user can update their own index entry
      {
        type: 'SET_RULE',
        ref: `${APP_PATH}/index/by_topic/$topic_key/explorers/$user_addr`,
        value: {
          '.rule': {
            write: 'auth.addr === $user_addr',
          },
        },
      },
      // Write rules for access receipts: only the buyer can write their receipts
      {
        type: 'SET_RULE',
        ref: `${APP_PATH}/access/$buyer_addr`,
        value: {
          '.rule': {
            write: 'auth.addr === $buyer_addr',
          },
        },
      },
      // Write rules for graph nodes: any authenticated user can write
      {
        type: 'SET_RULE',
        ref: `${APP_PATH}/graph/nodes`,
        value: {
          '.rule': {
            write: "auth.addr !== ''",
          },
        },
      },
      // Write rules for graph edges: any authenticated user can write
      {
        type: 'SET_RULE',
        ref: `${APP_PATH}/graph/edges`,
        value: {
          '.rule': {
            write: "auth.addr !== ''",
          },
        },
      },
      // Attach native function trigger for topic info writes
      {
        type: 'SET_FUNCTION',
        ref: `${APP_PATH}/topics`,
        value: {
          '.function': {
            '_syncKnowledgeTopic': {
              function_type: 'NATIVE',
              function_id: '_syncKnowledgeTopic',
            },
          },
        },
      },
      // Attach native function trigger for exploration writes
      {
        type: 'SET_FUNCTION',
        ref: `${APP_PATH}/explorations/$addr/$topic_key/$entry_id`,
        value: {
          '.function': {
            '_syncKnowledgeExploration': {
              function_type: 'NATIVE',
              function_id: '_syncKnowledgeExploration',
            },
          },
        },
      },
    ];

    const txInput: TransactionInput = {
      operation: {
        type: 'SET',
        op_list,
      },
      ...this._buildTxOptions(options),
    };

    return this._ain.sendTransaction(txInput);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _buildTxOptions(options?: KnowledgeTxOptions): Partial<TransactionInput> {
    const txOpts: any = {};
    if (options?.nonce !== undefined) txOpts.nonce = options.nonce;
    if (options?.address) txOpts.address = options.address;
    if (options?.gas_price !== undefined) txOpts.gas_price = options.gas_price;
    return txOpts;
  }
}
