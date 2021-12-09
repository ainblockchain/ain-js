import { EventEmitter } from 'events';
import Ain from '../ain';
import {
  BlockchainEventTypes,
  BlockFinalizedEventConfig,
  EventChannelConnectionOption,
  EventConfigType,
  ValueChangedEventConfig,
} from '../types';
import EventFilter from './event-filter';
import EventChannelManager from './event-channel-manager';
import { PushId } from '../ain-db/push-id';

export default class EventHandler {
  private readonly _filters: { [filterId: string]: EventFilter };
  private readonly _eventEmitters: { [filterId: string]: EventEmitter };
  private _ain: Ain;
  private _eventChannelManager: EventChannelManager;

  constructor(ain: Ain) {
    this._filters = {};
    this._eventEmitters = {};
    this._ain = ain;
    this._eventChannelManager = new EventChannelManager(ain, this);
  }

  async connect(connectionOption?: EventChannelConnectionOption) {
    await this._eventChannelManager.connect(connectionOption || {});
  }

  disconnect() {
    this._eventChannelManager.disconnect();
  }

  emitEvent(filterId: string, payload: any) {
    const targetEventEmitter = this._eventEmitters[filterId];
    if (!targetEventEmitter) {
      throw Error(`Can't find event emitter by filter id (${filterId})`);
    }
    targetEventEmitter.emit('data', payload);
  }

  emitError(filterId: string, errorMessage: string) {
    const targetEventEmitter = this._eventEmitters[filterId];
    if (!targetEventEmitter) {
      throw Error(`Can't find event emitter by filter id (${filterId})`);
    }
    targetEventEmitter.emit('error', errorMessage);
  }

  buildFilterId() {
    return PushId.generate();
  }

  subscribe(
      eventType: 'BLOCK_FINALIZED',
      config: BlockFinalizedEventConfig): EventEmitter;
  subscribe(
      eventType: 'VALUE_CHANGED',
      config: ValueChangedEventConfig): EventEmitter;
  subscribe(eventTypeStr: string, config: EventConfigType): EventEmitter {
    if (!this._eventChannelManager.isConnected) {
      throw Error(`Event channel is not connected! You must call ain.eh.connect() before using subscribe()`);
    }
    const eventType = eventTypeStr as BlockchainEventTypes;
    const eventEmitter = new EventEmitter();
    switch (eventType) {
      case BlockchainEventTypes.BLOCK_FINALIZED:
        const filterId = this.buildFilterId();
        if (this._filters[filterId]) { // TODO(cshcomcom): Retry logic
          throw Error(`Already existing filter id in filters (${filterId})`);
        }
        if (this._eventEmitters[filterId]) {
          throw Error(`Already existing event emitter (${filterId})`);
        }
        const filter = new EventFilter(filterId, eventType, config);
        this._eventChannelManager.registerFilter(filter);
        this._filters[filterId] = filter;
        this._eventEmitters[filterId] = eventEmitter;
        break;
      case BlockchainEventTypes.VALUE_CHANGED: // TODO(cshcomcom): Implement
        throw Error(`Not implemented`);
      default:
        throw Error(`Invalid event type (${eventType})`);
    }
    return eventEmitter;
  }
}
