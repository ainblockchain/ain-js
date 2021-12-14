import Ain from '../ain';
import {
  BlockFinalizedEventConfig,
  EventChannelConnectionOption,
  EventConfigType,
  TxStateChangedEventConfig,
  ValueChangedEventConfig,
} from '../types';
import EventChannelClient from './event-channel-client';
import EventCallbackManager from './event-callback-manager';
import Subscription from './subscription';

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
      dataCallback?: (data: any) => void, errorCallback?: (error: any) => void): Subscription;
  subscribe(
      eventType: 'VALUE_CHANGED', config: ValueChangedEventConfig,
      dataCallback?: (data: any) => void, errorCallback?: (error: any) => void): Subscription;
  subscribe(
      eventType: 'TX_STATE_CHANGED', config: TxStateChangedEventConfig,
      dataCallback?: (data: any) => void, errorCallback?: (error: any) => void): Subscription;
  subscribe(
      eventTypeStr: string, config: EventConfigType,
      dataCallback?: (data: any) => void, errorCallback?: (error: any) => void): Subscription {
    if (!this._eventChannelClient.isConnected) {
      throw Error(`Event channel is not connected! You must call ain.eh.connect() before using subscribe()`);
    }
    const filter = this._eventCallbackManager.createFilter(eventTypeStr, config);
    this._eventChannelClient.registerFilter(filter);
    return this._eventCallbackManager.createSubscription(filter, dataCallback, errorCallback);
  }
}
