import { BlockchainEventTypes, BlockchainEventConfig } from '../types';

export default class EventFilter {
  public readonly id: string;
  public readonly type: BlockchainEventTypes;
  public readonly config: BlockchainEventConfig;

  constructor(id: string, type: BlockchainEventTypes, config: BlockchainEventConfig) {
    this.id = id;
    this.type = type;
    this.config = config;
  }

  toObject() {
    return {
      id: this.id,
      type: this.type,
      config: this.config,
    };
  }
}
