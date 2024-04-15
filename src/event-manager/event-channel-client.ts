import Ain from '../ain';
import * as WebSocket from 'isomorphic-ws';
import {
  EventChannelMessageTypes,
  EventChannelMessage,
  BlockchainEventTypes,
  EventChannelConnectionOptions,
  DisconnectionCallback,
} from '../types';
import EventFilter from './event-filter';
import EventCallbackManager from './event-callback-manager';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000 + 1000; // NOTE: This time must be longer than blockchain event handler heartbeat interval.
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 30000;

/**
 * A class for managing event channels and event handling callback functions.
 */
export default class EventChannelClient {
  /** The Ain object. */
  private readonly _ain: Ain;
  /** The event callback manager object. */
  private readonly _eventCallbackManager: EventCallbackManager;
  /** The web socket client. */
  private _ws?: WebSocket;
  /** The blockchain endpoint URL. */
  private _endpointUrl?: string;
  /** Whether it's connected or not. */
  private _isConnected: boolean;
  /** The heartbeat timeout object. */
  private _heartbeatTimeout?: ReturnType<typeof setTimeout> | null;

  /**
   * Creates a new EventChannelClient object.
   * @param {Ain} ain The Ain object.
   * @param {EventCallbackManager} eventCallbackManager The event callback manager object.
   */
  constructor(ain: Ain, eventCallbackManager: EventCallbackManager) {
    this._ain = ain;
    this._eventCallbackManager = eventCallbackManager;
    this._ws = undefined;
    this._endpointUrl = undefined;
    this._isConnected = false;
    this._heartbeatTimeout = undefined;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Opens a new event channel.
   * @param {EventChannelConnectionOptions} connectionOption The event channel connection options.
   * @param {DisconnectionCallback} disconnectionCallback The disconnection callback function.
   * @returns {Promise<void>} A promise for the connection success.
   */
  connect(connectionOption: EventChannelConnectionOptions, disconnectionCallback?: DisconnectionCallback): Promise<any> {
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
      // TODO(platfowner): Add a custom handshake timeout.
      this._ws = new WebSocket(url, [], { handshakeTimeout: connectionOption.handshakeTimeout || DEFAULT_HANDSHAKE_TIMEOUT_MS });

      this._ws.onmessage = (event: { data: unknown }) => {
        if (typeof event.data !== 'string') {
          return;
        }
        this.handleMessage(event.data);
      };

      this._ws.onerror = async (event: unknown) => {
        console.error(event);
        this.disconnect();
      };

      this._ws.onopen = () => {
        this._isConnected = true;
        this.startHeartbeatTimer(DEFAULT_HEARTBEAT_INTERVAL_MS);
        resolve(this);
      };

      // TODO(platfowner): Add a custom ping-poing for heartbeat.
      // NOTE(jiyoung): implement onping method here.
      // this._wsClient.on('ping', () => {
      //   if (this._heartbeatTimeout) {
      //     clearTimeout(this._heartbeatTimeout);
      //   }
      //   this.startHeartbeatTimer(DEFAULT_HEARTBEAT_INTERVAL_MS);
      // });

      this._ws.onclose = () => {
        this.disconnect();
        if (disconnectionCallback) {
          disconnectionCallback(this._ws);
        }
      };
    });
  }

  /**
   * Closes the current event channel.
   */
  disconnect() {
    this._isConnected = false;
    this._ws!.close();
    if (this._heartbeatTimeout) {
      clearTimeout(this._heartbeatTimeout);
      this._heartbeatTimeout = null;
    }
  }

  /**
   * Starts the heartbeat timer for the event channel.
   * @param {number} timeoutMs The timeout value in miliseconds.
   */
  startHeartbeatTimer(timeoutMs: number) {
    this._heartbeatTimeout = setTimeout(() => {
      console.log(`Connection timeout! Terminate the connection. All event subscriptions are stopped.`);
      this._ws!.close();
    }, timeoutMs);
  }

  /**
   * Handles an emit-event message from the event channel.
   * @param {any} messageData The payload data of the message.
   */
  handleEmitEventMessage(messageData: any) {
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
    this._eventCallbackManager.emitEvent(filterId, eventType, payload);
  }

  /**
   * Handles an emit-error message from the event channel.
   * @param {any} messageData The payload data of the message.
   */
  handleEmitErrorMessage(messageData: any) {
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
    const filterId = messageData.filter_id;
    if (!filterId) {
      console.log(errorMessage);
      return;
    }
    this._eventCallbackManager.emitError(filterId, code, errorMessage);
  }

  /**
   * Handles a message from the event channel.
   * @param {string} message The message.
   */
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

  /**
   * Builds a message to be sent to the event channel.
   * @param {EventChannelMessageTypes} messageType The message type.
   * @param {any} data The payload data of the msssage.
   * @returns 
   */
  buildMessage(messageType: EventChannelMessageTypes, data: any): EventChannelMessage {
    return {
      type: messageType,
      data: data,
    };
  }

  /**
   * Sends a message to the event channel.
   * @param {EventChannelMessage} message The message to be sent.
   */
  sendMessage(message: EventChannelMessage) {
    if (!this._isConnected) {
      throw Error(`Failed to send message. Event channel is not connected!`);
    }
    this._ws!.send(JSON.stringify(message));
  }

  /**
   * Sends a register-event-filter messsage to the event channel.
   * @param {EventFilter} filter The event filter to register.
   */
  registerFilter(filter: EventFilter) {
    const filterObj = filter.toObject();
    const registerMessage = this.buildMessage(EventChannelMessageTypes.REGISTER_FILTER, filterObj);
    this.sendMessage(registerMessage);
  }

  /**
   * Sends a deregister-event-filter messsage to the event channel.
   * @param {EventFilter} filter The event filter to deregister.
   */
  deregisterFilter(filter: EventFilter) {
    const filterObj = filter.toObject();
    const deregisterMessage = this.buildMessage(EventChannelMessageTypes.DEREGISTER_FILTER, filterObj);
    this.sendMessage(deregisterMessage);
  }
}
