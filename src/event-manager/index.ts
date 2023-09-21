import Ain from '../ain';
import {
  BlockFinalizedEventConfig, BlockFinalizedEvent,
  ErrorFirstCallback,
  EventChannelConnectionOptions,
  BlockchainEventConfig, BlockchainEventCallback,
  TxStateChangedEventConfig, TxStateChangedEvent,
  ValueChangedEventConfig, ValueChangedEvent, DisconnectCallback, FilterDeletedEventCallback,
} from '../types';
import EventChannelClient from './event-channel-client';
import EventCallbackManager from './event-callback-manager';
import EventFilter from './event-filter';

export default class EventManager {
  private _ain: Ain;
  private readonly _eventCallbackManager: EventCallbackManager;
  private readonly _eventChannelClient: EventChannelClient;

  constructor(ain: Ain) {
    this._ain = ain;
    this._eventCallbackManager = new EventCallbackManager();
    this._eventChannelClient = new EventChannelClient(ain, this._eventCallbackManager);
  }

  async connect(connectionOption?: EventChannelConnectionOptions, disconnectCallback?: DisconnectCallback) {
    await this._eventChannelClient.connect(connectionOption || {}, disconnectCallback);
  }

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
