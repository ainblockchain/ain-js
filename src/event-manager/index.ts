import Ain from '../ain';
import {
  BlockFinalizedEventConfig, BlockFinalizedEvent,
  ErrorFirstCallback,
  EventChannelConnectionOptions,
  BlockchainEventConfig, BlockchainEventCallback,
  TxStateChangedEventConfig, TxStateChangedEvent,
  ValueChangedEventConfig, ValueChangedEvent, DisconnectionCallback, FilterDeletedEventCallback,
} from '../types';
import EventChannelClient from './event-channel-client';
import EventCallbackManager from './event-callback-manager';
import EventFilter from './event-filter';

/**
 * A class for managing blockchain events.
 */
export default class EventManager {
  /** The event callback manager. */
  private readonly _eventCallbackManager: EventCallbackManager;
  /** The event channel client. */
  private readonly _eventChannelClient: EventChannelClient;

  /**
   * Creates a new EventManager object.
   * @param {Ain} ain The Ain object.
   */
  constructor(ain: Ain) {
    this._eventCallbackManager = new EventCallbackManager();
    this._eventChannelClient = new EventChannelClient(ain, this._eventCallbackManager);
  }

  /**
   * Opens a new event channel.
   * @param {EventChannelConnectionOptions} connectionOption The event channel connection options.
   * @param {DisconnectionCallback} disconnectionCallback The disconnection callback function.
   */
  async connect(connectionOption?: EventChannelConnectionOptions, disconnectionCallback?: DisconnectionCallback) {
    await this._eventChannelClient.connect(connectionOption || {}, disconnectionCallback);
  }

  /**
   * Closes the current event channel.
   */
  disconnect() {
    this._eventChannelClient.disconnect();
  }

  subscribe(
    eventType: 'BLOCK_FINALIZED',
    config: BlockFinalizedEventConfig,
    eventCallback?: (event: BlockFinalizedEvent) => void,
    errorCallback?: (error: any) => void
  ): string;
  subscribe(
    eventType: 'VALUE_CHANGED',
    config: ValueChangedEventConfig,
    eventCallback?: (event: ValueChangedEvent) => void,
    errorCallback?: (error: any) => void
  ): string;
  subscribe(
    eventType: 'TX_STATE_CHANGED',
    config: TxStateChangedEventConfig,
    eventCallback?: (event: TxStateChangedEvent) => void,
    errorCallback?: (error: any) => void,
    filterDeletedEventCallback?: FilterDeletedEventCallback
  ): string;
  /**
   * Subscribes to blockchain events.
   * @param {string} eventTypeStr The event type.
   * @param {BlockchainEventConfig} config The blockchain event configuraiton.
   * @param {BlockchainEventCallback} eventCallback The blockchain event callback function.
   * @param {(error: any) => void} errorCallback The error event callback function.
   * @param {FilterDeletedEventCallback} errorCallback The filter-deleted event callback function.
   * @returns {string} The created filter ID.
   */
  subscribe(
    eventTypeStr: string,
    config: BlockchainEventConfig,
    eventCallback?: BlockchainEventCallback,
    errorCallback?: (error: any) => void,
    filterDeletedEventCallback?: FilterDeletedEventCallback
  ): string {
    if (!this._eventChannelClient.isConnected) {
      throw Error(`Event channel is not connected! You must call ain.eh.connect() before using subscribe()`);
    }
    const filter = this._eventCallbackManager.createFilter(eventTypeStr, config);
    this._eventChannelClient.registerFilter(filter);
    this._eventCallbackManager.createSubscription(filter, eventCallback, errorCallback, filterDeletedEventCallback);
    return filter.id;
  }

  /**
   * Cancel a subscription.
   * @param {string} filterId The filter ID of the subscription to cancel.
   * @param {ErrorFirstCallback} callback The error handling callback function.
   */
  unsubscribe(filterId: string, callback: ErrorFirstCallback<EventFilter>) {
    try {
      if (!this._eventChannelClient.isConnected) {
        throw Error(`Event channel is not connected! You must call ain.eh.connect() before using unsubscribe()`);
      }
      const filter = this._eventCallbackManager.getFilter(filterId);
      this._eventChannelClient.deregisterFilter(filter);
      // NOTE(ehgmsdk20): This does not mean filter is deleted. It just means that delete request is successfully sent.
      callback(null, filter);
    } catch (err) {
      callback(err, null);
    }
  }
}
