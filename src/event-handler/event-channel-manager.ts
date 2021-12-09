import Ain from '../ain';
import EventHandler from './index';
import { WebSocket } from 'ws';
import {
  EventChannelMessageTypes,
  EventChannelMessage,
  BlockchainEventTypes,
  EventChannelConnectionOption,
} from '../types';
import EventFilter from './event-filter';

export default class EventChannelManager {
  private readonly _ain: Ain;
  private readonly _eventHandler: EventHandler;
  private _wsClient?: WebSocket;
  private _endpointUrl?: string;
  private _isConnected: boolean;

  constructor(ain: Ain, eventHandler) {
    this._ain = ain;
    this._eventHandler = eventHandler;
    this._wsClient = undefined;
    this._endpointUrl = undefined;
    this._isConnected = false;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  connect(connectionOption: EventChannelConnectionOption) {
    return new Promise(async (resolve, reject) => {
      const eventHandlerNetworkInfo = await this._ain.net.getEventHandlerNetworkInfo();
      const url = eventHandlerNetworkInfo.url;
      if (!url) {
        reject(new Error(`Can't get url from eventHandlerNetworkInfo ` +
            `(${JSON.stringify(eventHandlerNetworkInfo, null, 2)}`));
      }
      this._endpointUrl = url;
      this._wsClient = new WebSocket(url, [], { handshakeTimeout: connectionOption.handshakeTimeout || 30000 });
      this._wsClient.on('message', (message) => {
        this.handleMessage(message);
      });
      this._wsClient.on('error', (err) => {
        reject(err);
      });
      this._wsClient.on('open', () => {
        this._isConnected = true;
        resolve();
      });
      // TODO(cshcomcom): Handle close connection (w/ ping-pong)
    })
  }

  disconnect() {
    this._isConnected = false;
    this._wsClient.close();
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
    this._eventHandler.emitEvent(filterId, payload);
  }

  handleEmitErrorMessage(messageData) {
    const filterId = messageData.filter_id;
    if (!filterId) {
      throw Error(`Can't find filter ID from message data (${JSON.stringify(messageData, null, 2)})`);
    }
    // TODO(cshcomcom): error codes
    const errorMessage = messageData.error_message;
    if (!errorMessage) {
      throw Error(`Can't find error message from message data (${JSON.stringify(messageData, null, 2)})`);
    }
    this._eventHandler.emitError(filterId, errorMessage);
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
      // TODO(cshcomcom): Error handling
    }
  }

  buildMessage(messageType: EventChannelMessageTypes, data: any): EventChannelMessage {
    return {
      type: messageType,
      data: data,
    };
  }

  registerFilter(filter: EventFilter) {
    const filterObj = filter.toObject();
    const emitFilterMessage = this.buildMessage(EventChannelMessageTypes.REGISTER_FILTER, filterObj);
    this._wsClient.send(JSON.stringify(emitFilterMessage));
  }
}
