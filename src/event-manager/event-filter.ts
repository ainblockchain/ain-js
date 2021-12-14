import { BlockchainEventTypes, EventConfigType } from '../types';

export default class EventFilter {
  public readonly id: string;
  public readonly type: BlockchainEventTypes;
  public readonly config: EventConfigType;

  constructor(id: string, type: BlockchainEventTypes, config: EventConfigType) {
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
