import Ain from '../ain';
import { WebSocket } from 'ws';
import {
  EventChannelMessageTypes,
  EventChannelMessage,
  BlockchainEventTypes,
  EventChannelConnectionOption,
  DisconnectCallback,
} from '../types';
import EventFilter from './event-filter';
import EventCallbackManager from './event-callback-manager';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000 + 1000; // NOTE: This time must be longer than blockchain event handler heartbeat interval.

export default class EventChannelClient {
  private readonly _ain: Ain;
  private readonly _eventCallbackManager: EventCallbackManager;
  private _wsClient?: WebSocket;
  private _endpointUrl?: string;
  private _isConnected: boolean;
  private _heartbeatTimeout?: ReturnType<typeof setTimeout> | null;

  constructor(ain: Ain, eventCallbackManager: EventCallbackManager) {
    this._ain = ain;
    this._eventCallbackManager = eventCallbackManager;
    this._wsClient = undefined;
    this._endpointUrl = undefined;
    this._isConnected = false;
    this._heartbeatTimeout = undefined;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  connect(connectionOption: EventChannelConnectionOption, disconnectCallback?: DisconnectCallback) {
    return new Promise(async (resolve, reject) => {
      if (this.isConnected) {
        reject(new Error(`Can't connect multiple channels`));
        return;
      }
      const eventHandlerNetworkInfo = await this._ain.net.getEventHandlerNetworkInfo();
      const url = eventHandlerNetworkInfo.url;
      if (!url) {
        reject(new Error(`Can't get url from eventHandlerNetworkInfo ` +
            `(${JSON.stringify(eventHandlerNetworkInfo, null, 2)})`));
        return;
      }
      const maxNumEventChannels = eventHandlerNetworkInfo.maxNumEventChannels;
      if (maxNumEventChannels === undefined) {
        reject(new Error(`Can't get maxNumEventChannels limit from eventHandlerNetworkInfo ` +
            `(${maxNumEventChannels})`));
        return;
      }
      const numEventChannels = eventHandlerNetworkInfo.numEventChannels;
      if (numEventChannels === undefined) {
        reject(new Error(`Can't get numEventChannels from eventHandlerNetworkInfo ` +
            `(${numEventChannels})`));
        return;
      }
      if (numEventChannels >= maxNumEventChannels) {
        reject(new Error(`Exceed event channel limit! (node:${url})`));
        return;
      }

      this._endpointUrl = url;
      this._wsClient = new WebSocket(url, [], { handshakeTimeout: connectionOption.handshakeTimeout || 30000 });
      this._wsClient.on('message', (message) => {
        this.handleMessage(message);
      });
      this._wsClient.on('error', (err) => {
        console.error(err);
        this.disconnect();
      });
      this._wsClient.on('open', () => {
        this._isConnected = true;
        this.startHeartbeatTimer(connectionOption.heartbeatIntervalMs || DEFAULT_HEARTBEAT_INTERVAL_MS);
        resolve();
      });
      this._wsClient.on('ping', () => {
        if (this._heartbeatTimeout) {
          clearTimeout(this._heartbeatTimeout);
        }
        this.startHeartbeatTimer(connectionOption.heartbeatIntervalMs || DEFAULT_HEARTBEAT_INTERVAL_MS);
      });
      this._wsClient.on('close', () => {
        this.disconnect();
        if (disconnectCallback) {
          disconnectCallback(this._wsClient);
        }
      });
    })
  }

  disconnect() {
    this._isConnected = false;
    this._wsClient.terminate();
    if (this._heartbeatTimeout) {
      clearTimeout(this._heartbeatTimeout);
      this._heartbeatTimeout = null;
    }
  }

  startHeartbeatTimer(timeoutMs: number) {
    this._heartbeatTimeout = setTimeout(() => {
      console.log(`Connection timeout! Terminate the connection. All event subscriptions are stopped.`);
      this._wsClient.terminate();
    }, timeoutMs);
  }

  handleEmitEventMessage(messageData) {
    const filterId = messageData.filter_id;
    if (!filterId) {
      throw Error(`Can't find filter ID from message data (${JSON.stringify(messageData, null, 2)})`);
    }
    const eventTypeStr = messageData.type;
    const eventType = eventTypeStr as BlockchainEventTypes;
    if (!Object.values(BlockchainEventTypes).includes(eventType)) {
      throw Error(`Invalid event type (${eventTypeStr})`);
    }
    const payload = messageData.payload;
    if (!payload) {
      throw Error(`Can't find payload from message data (${JSON.stringify(messageData, null, 2)})`);
    }
    this._eventCallbackManager.emitEvent(filterId, payload);
  }

  handleEmitErrorMessage(messageData) {
    const filterId = messageData.filter_id;
    if (!filterId) {
      console.log(`Can't find filter ID from message data (${JSON.stringify(messageData, null, 2)})`);
      return;
    }
    const code = messageData.code;
    if (!code) {
      console.log(`Can't find code from message data (${JSON.stringify(messageData, null, 2)})`);
      return;
    }
    const errorMessage = messageData.message;
    if (!errorMessage) {
      console.log(`Can't find error message from message data (${JSON.stringify(messageData, null, 2)})`);
      return;
    }
    this._eventCallbackManager.emitError(filterId, code, errorMessage);
  }

  handleMessage(message: string) {
    try {
      const parsedMessage = JSON.parse(message);
      const messageType = parsedMessage.type;
      if (!messageType) {
        throw Error(`Can't find type from message (${message})`);
      }
      const messageData = parsedMessage.data;
      if (!messageData) {
        throw Error(`Can't find data from message (${message})`);
      }
      switch (messageType) {
        case EventChannelMessageTypes.EMIT_EVENT:
          this.handleEmitEventMessage(messageData);
          break;
        case EventChannelMessageTypes.EMIT_ERROR:
          this.handleEmitErrorMessage(messageData);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error(err);
    }
  }

  buildMessage(messageType: EventChannelMessageTypes, data: any): EventChannelMessage {
    return {
      type: messageType,
      data: data,
    };
  }

  sendMessage(message: EventChannelMessage) {
    if (!this._isConnected) {
      throw Error(`Failed to send message. Event channel is not connected!`);
    }
    this._wsClient.send(JSON.stringify(message));
  }

  registerFilter(filter: EventFilter) {
    const filterObj = filter.toObject();
    const registerMessage = this.buildMessage(EventChannelMessageTypes.REGISTER_FILTER, filterObj);
    this.sendMessage(registerMessage);
  }

  deregisterFilter(filter: EventFilter) {
    const filterObj = filter.toObject();
    const deregisterMessage = this.buildMessage(EventChannelMessageTypes.DEREGISTER_FILTER, filterObj);
    this.sendMessage(deregisterMessage);
  }
}
