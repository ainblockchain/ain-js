import { BlockchainEventTypes, BlockchainEventConfig } from '../types';

/**
 * A class for filtering blockchain events.
 */
export default class EventFilter {
  /** The event filter ID. */
  public readonly id: string;
  /** The blockchain event type. */
  public readonly type: BlockchainEventTypes;
  /** The blockchain event configuration. */
  public readonly config: BlockchainEventConfig;

  /**
   * Creates a new EventFilter object.
   * @param {string} id The event filter ID object.
   * @param {BlockchainEventTypes} type The blockchain event type value.
   * @param {BlockchainEventConfig} config The blockchain event configuration object.
   */
  constructor(id: string, type: BlockchainEventTypes, config: BlockchainEventConfig) {
    this.id = id;
    this.type = type;
    this.config = config;
  }

  /**
   * Converts to a javascript object.
   * @returns {Object} The javascript object.
   */
  toObject() {
    return {
      id: this.id,
      type: this.type,
      config: this.config,
    };
  }
}
