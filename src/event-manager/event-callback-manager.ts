import EventFilter from './event-filter';
import Subscription from './subscription';
import { BlockchainEventTypes, BlockchainEventConfig, BlockchainEventCallback, BlockchainErrorCallback, FilterDeletedEventCallback, FilterDeletedEvent } from '../types';
import { PushId } from '../ain-db/push-id';
import { FAILED_TO_REGISTER_ERROR_CODE } from '../constants';

/**
 * A class for managing event callbacks.
 */
export default class EventCallbackManager {
  /** The event filter map from filter ID to event filter. */
  private readonly _filters: Map<string, EventFilter>;
  /** The subscription map from filter ID to subscription. */
  private readonly _filterIdToSubscription: Map<string, Subscription>;

  /**
   * Creates a new EventCallbackManager object.
   */
  constructor() {
    this._filters = new Map<string, EventFilter>();
    this._filterIdToSubscription = new Map<string, Subscription>();
  }

  /**
   * Builds a filter ID.
   * @returns {string} The filter ID built.
   */
  buildFilterId() {
    return PushId.generate();
  }

  /**
   * Builds a subscription ID.
   * @returns {string} The subscription ID built.
   */
  buildSubscriptionId() {
    return PushId.generate();
  }

  /**
   * Emits a blockchain event to trigger callback functions.
   * @param {string} filterId The filter ID.
   * @param {BlockchainEventTypes} eventType The blockchain event type.
   * @param {any} payload The payload of the event.
   */
  emitEvent(filterId: string, eventType: BlockchainEventTypes, payload: any) {
    const subscription = this._filterIdToSubscription.get(filterId);
    if (!subscription) {
      throw Error(`Can't find subscription by filter id (${filterId})`);
    }
    if (eventType === BlockchainEventTypes.FILTER_DELETED) {
      subscription.emit('filterDeleted', payload);
      return;
    }
    subscription.emit('event', payload);
  }

  /**
   * Emits an error to trigger callback functions.
   * @param {string} filterId The filter ID.
   * @param {number} code The error code.
   * @param {string} errorMessage The error message.
   */
  emitError(filterId: string, code: number, errorMessage: string) {
    const subscription = this._filterIdToSubscription.get(filterId);
    if (!subscription) {
      throw Error(`Can't find subscription by filter id (${filterId})`);
    }
    if (code === FAILED_TO_REGISTER_ERROR_CODE) {
      this.deleteFilter(filterId);
    }
    subscription.emit('error', {
      code: code,
      message: errorMessage,
    });
  }

  /**
   * Creates a new EventFilter object and adds it to the event filter map.
   * @param {string} eventTypeStr The event type string.
   * @param {BlockchainEventConfig} config The blockchain event configuration.
   * @returns {EventFilter} The event filter object created.
   */
  createFilter(eventTypeStr: string, config: BlockchainEventConfig): EventFilter {
    const eventType = eventTypeStr as BlockchainEventTypes;
    if (!Object.values(BlockchainEventTypes).includes(eventType) ||
        eventType === BlockchainEventTypes.FILTER_DELETED) {
      throw Error(`Invalid event type (${eventType})`);
    }
    const filterId = this.buildFilterId();
    if (this._filters.get(filterId)) { // TODO(cshcomcom): Retry logic.
      throw Error(`Already existing filter id in filters (${filterId})`);
    }
    const filter = new EventFilter(filterId, eventType, config);
    this._filters.set(filterId, filter);
    return filter;
  }

  /**
   * Looks up an event filter with a filter ID.
   * @param {string} filterId The filter ID.
   * @returns {EventFilter} The event filter looked up.
   */
  getFilter(filterId: string): EventFilter {
    const filter = this._filters.get(filterId);
    if (!filter) {
      throw Error(`Non-existent filter ID (${filterId})`);
    }
    return filter;
  }

  /**
   * Creates a new Subscription object.
   * @param {EventFilter} filter The event filter.
   * @param {BlockchainEventCallback} eventCallback The blockchain event callback function.
   * @param {BlockchainErrorCallback} errorCallback The blockchain error callback function.
   * @param {FilterDeletedEventCallback} filterDeletedEventCallback The filter deletion event callback function.
   * @returns {Subscription} The subscription object created.
   */
  createSubscription(
    filter: EventFilter,
    eventCallback?: BlockchainEventCallback,
    errorCallback?: BlockchainErrorCallback,
    filterDeletedEventCallback: FilterDeletedEventCallback = (payload) => console.log(
        `Event filter (id: ${payload.filter_id}) is deleted because of ${payload.reason}`)
  ): Subscription {
    const subscription = new Subscription(filter);
    subscription.on(
      'filterDeleted', (payload: FilterDeletedEvent) => {
        this.deleteFilter(payload.filter_id);
        filterDeletedEventCallback(payload);
      }
    );
    if (eventCallback) {
      subscription.on('event', eventCallback);
    }
    if (errorCallback) {
      subscription.on('error', errorCallback);
    }
    this._filterIdToSubscription.set(filter.id, subscription);
    return subscription;
  }

  /**
   * Deletes an event filter.
   * @param {string} filterId The event filter ID to delete.
   */
  deleteFilter(filterId: string) {
    if (!this._filterIdToSubscription.delete(filterId)) {
      console.log(`Can't remove the subscription because it can't be found. (${filterId})`);
    }
    if (!this._filters.delete(filterId)) {
      console.log(`Can't remove the filter because it can't be found. (${filterId})`);
    }
  }
}
