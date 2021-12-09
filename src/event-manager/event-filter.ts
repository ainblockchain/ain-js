import { BlockchainEventTypes, EventConfigType } from '../types';

export default class EventFilter {
  public readonly _id: string;
  public readonly _type: BlockchainEventTypes;
  public readonly _config: EventConfigType;

  constructor(id: string, type: BlockchainEventTypes, config: EventConfigType) {
    this._id = id;
    this._type = type;
    this._config = config;
  }

  toObject() {
    return {
      id: this._id,
      type: this._type,
      config: this._config,
    };
  }
}
