import EventFilter from './event-filter';
import Subscription from './subscription';
import { BlockchainEventTypes, EventConfigType } from '../types';
import { PushId } from '../ain-db/push-id';

export default class EventCallbackManager {
  private readonly _filters: { [filterId: string]: EventFilter };
  private readonly _filterIdToSubscriptionId: { [filterId: string]: string };
  private readonly _subscriptions: { [subscriptionId: string]: Subscription };

  constructor() {
    this._filters = {};
    this._filterIdToSubscriptionId = {};
    this._subscriptions = {};
  }

  buildFilterId() {
    return PushId.generate();
  }

  buildSubscriptionId() {
    return PushId.generate();
  }

  emitEvent(filterId: string, payload: any) {
    const subscriptionId = this._filterIdToSubscriptionId[filterId];
    if (!subscriptionId) {
      throw Error(`Can't find subscription id by filter id (${filterId})`);
    }
    const subscription = this._subscriptions[subscriptionId];
    if (!subscription) {
      throw Error(`Can't find subscription by subscription id (${subscriptionId})`);
    }
    subscription.emit('data', payload);
  }

  emitError(filterId: string, errorMessage: string) {
    const subscriptionId = this._filterIdToSubscriptionId[filterId];
    if (!subscriptionId) {
      throw Error(`Can't find subscription id by filter id (${filterId})`);
    }
    const subscription = this._subscriptions[subscriptionId];
    if (!subscription) {
      throw Error(`Can't find subscription by subscription id (${subscriptionId})`);
    }
    subscription.emit('error', errorMessage);
  }

  createFilter(eventTypeStr: string, config: EventConfigType): EventFilter {
    const eventType = eventTypeStr as BlockchainEventTypes;
    switch (eventType) {
      case BlockchainEventTypes.BLOCK_FINALIZED:
        const filterId = this.buildFilterId();
        if (this._filters[filterId]) { // TODO(cshcomcom): Retry logic
          throw Error(`Already existing filter id in filters (${filterId})`);
        }
        const filter = new EventFilter(filterId, eventType, config);
        this._filters[filterId] = filter;
        return filter;
      case BlockchainEventTypes.VALUE_CHANGED: // TODO(cshcomcom): Implement
        throw Error(`Not implemented`);
      case BlockchainEventTypes.TX_STATE_CHANGED: // TODO(cshcomcom): Implement
        throw Error(`Not implemented`);
      default:
        throw Error(`Invalid event type (${eventType})`);
    }
  }

  createSubscription(filter: EventFilter) {
    if (this._filterIdToSubscriptionId[filter.id]) {
      throw Error(`Already existing filter id in filterIdToSubscriptionId (${filter.id})`);
    }
    const subscriptionId = this.buildSubscriptionId();
    if (this._subscriptions[subscriptionId]) { // TODO(cshcomcom): Retry logic
      throw Error(`Already existing subscription id in subscriptions (${subscriptionId})`);
    }
    const subscription = new Subscription(subscriptionId, filter);
    this._subscriptions[subscriptionId] = subscription;
    this._filterIdToSubscriptionId[filter.id] = subscriptionId;
    return subscription;
  }
}
