import EventFilter from './event-filter';
import Subscription from './subscription';
import { BlockchainEventTypes, EventConfigType } from '../types';
import { PushId } from '../ain-db/push-id';

export default class EventCallbackManager {
  private readonly _filters: Map<string, EventFilter>;
  private readonly _filterIdToSubscription: Map<string, Subscription>;

  constructor() {
    this._filters = new Map<string, EventFilter>();
    this._filterIdToSubscription = new Map<string, Subscription>();
  }

  buildFilterId() {
    return PushId.generate();
  }

  buildSubscriptionId() {
    return PushId.generate();
  }

  emitEvent(filterId: string, payload: any) {
    const subscription = this._filterIdToSubscription.get(filterId);
    if (!subscription) {
      throw Error(`Can't find subscription by filter id (${filterId})`);
    }
    subscription.emit('data', payload);
  }

  emitError(filterId: string, code: number, errorMessage: string) {
    const subscription = this._filterIdToSubscription.get(filterId);
    if (!subscription) {
      throw Error(`Can't find subscription by filter id (${filterId})`);
    }
    subscription.emit('error', {
      code: code,
      message: errorMessage,
    });
  }

  createFilter(eventTypeStr: string, config: EventConfigType): EventFilter {
    const eventType = eventTypeStr as BlockchainEventTypes;
    if (!Object.values(BlockchainEventTypes).includes(eventType)) {
      throw Error(`Invalid event type (${eventType})`);
    } else if (eventType === BlockchainEventTypes.TX_STATE_CHANGED) {
      throw Error(`Not implemented`); // TODO(isak): Implement.
    }
    const filterId = this.buildFilterId();
    if (this._filters.get(filterId)) { // TODO(cshcomcom): Retry logic.
      throw Error(`Already existing filter id in filters (${filterId})`);
    }
    const filter = new EventFilter(filterId, eventType, config);
    this._filters.set(filterId, filter);
    return filter;
  }

  getFilter(filterId): EventFilter {
    const filter = this._filters.get(filterId);
    if (!filter) {
      throw Error(`Can't find filter by filter id (${filterId})`);
    }
    return filter;
  }

  createSubscription(filter: EventFilter, dataCallback?: (data: any) => void,
      errorCallback?: (error: any) => void) {
    const subscription = new Subscription(filter);
    if (dataCallback) {
      subscription.on('data', dataCallback);
    }
    if (errorCallback) {
      subscription.on('error', errorCallback);
    }
    this._filterIdToSubscription.set(filter.id, subscription);
    return subscription;
  }

  deleteFilter(filterId: string) {
    if (!this._filterIdToSubscription.delete(filterId)) {
      console.log(`Can't remove the subscription because it can't be found. (${filterId})`);
    }
    if (!this._filters.delete(filterId)) {
      console.log(`Can't remove the filter because it can't be found. (${filterId})`);
    }
  }
}
