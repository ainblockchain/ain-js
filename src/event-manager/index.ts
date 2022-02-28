import Ain from '../ain';
import {
  BlockFinalizedEventConfig,
  ErrorFirstCallback,
  EventChannelConnectionOption,
  EventConfigType,
  TxStateChangedEventConfig,
  ValueChangedEventConfig,
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

  async connect(connectionOption?: EventChannelConnectionOption) {
    await this._eventChannelClient.connect(connectionOption || {});
  }

  disconnect() {
    this._eventChannelClient.disconnect();
  }

  subscribe(
      eventType: 'BLOCK_FINALIZED', config: BlockFinalizedEventConfig,
      dataCallback?: (data: any) => void, errorCallback?: (error: any) => void): string;
  subscribe(
      eventType: 'VALUE_CHANGED', config: ValueChangedEventConfig,
      dataCallback?: (data: any) => void, errorCallback?: (error: any) => void): string;
  subscribe(
      eventType: 'TX_STATE_CHANGED', config: TxStateChangedEventConfig,
      dataCallback?: (data: any) => void, errorCallback?: (error: any) => void): string;
  subscribe(
      eventTypeStr: string, config: EventConfigType,
      dataCallback?: (data: any) => void, errorCallback?: (error: any) => void): string {
    if (!this._eventChannelClient.isConnected) {
      throw Error(`Event channel is not connected! You must call ain.eh.connect() before using subscribe()`);
    }
    const filter = this._eventCallbackManager.createFilter(eventTypeStr, config);
    this._eventChannelClient.registerFilter(filter);
    this._eventCallbackManager.createSubscription(filter, dataCallback, errorCallback);
    return filter.id;
  }

  unsubscribe(filterId: string, callback: ErrorFirstCallback<EventFilter>) {
    try {
      const filter = this._eventCallbackManager.getFilter(filterId);
      this._eventChannelClient.deregisterFilter(filter);
      this._eventCallbackManager.deleteFilter(filter.id);
      callback(null, filter);
    } catch (err) {
      callback(err, null);
    }
  }
}
