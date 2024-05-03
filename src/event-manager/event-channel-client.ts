import Ain from '../ain';
import isBrowser from "is-in-browser";
import WebSocket from 'isomorphic-ws';
import { WebSocket as WebSocketBE } from 'ws';
import {
  EventChannelMessageTypes,
  EventChannelMessage,
  BlockchainEventTypes,
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
  private _ws?: WebSocket | WebSocketBE;
  /** Whether it's connected or not. */
  private _isConnected: boolean;
  /** The handshake timeout object. */
  private _handshakeTimeout?: ReturnType<typeof setTimeout> | null;
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
    this._isConnected = false;
    this._handshakeTimeout = undefined;
    this._heartbeatTimeout = undefined;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Opens a new event channel.
   * @param {DisconnectionCallback} disconnectionCallback The disconnection callback function.
   * @returns {Promise<void>} A promise for the connection success.
   */
  connect(disconnectionCallback?: DisconnectionCallback): Promise<any> {
    return new Promise(async (resolve, reject) => {
      if (this.isConnected) {
        reject(new Error(`Can't connect multiple channels`));
        return;
      }
      const url = this._ain.eventHandlerUrl;
      if (!url) {
        reject(new Error(`eventHandlerUrl is not set properly: ${url}`));
        return;
      }
      // TODO(platfowner): Remove or re-implement without using getEventHandlerNetworkInfo() below.
      /*
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
      */

      // NOTE(platfowner): Fix WebSocket module import issue (see https://github.com/ainblockchain/ain-js/issues/177).
      this._ws = isBrowser ? new WebSocket(url) : new WebSocketBE(url);
      // NOTE(platfowner): A custom handshake timeout (see https://github.com/ainblockchain/ain-js/issues/171).
      this.startHandshakeTimer(DEFAULT_HANDSHAKE_TIMEOUT_MS);

      this._ws.onmessage = (event: { data: unknown }) => {
        if (typeof event.data !== 'string') {
          console.error(`Non-string event data: ${event.data}`);
          return;
        }
        try {
          const parsedMessage = JSON.parse(event.data);
          const messageType = parsedMessage.type;
          if (!messageType) {
            throw Error(`No message type in (${event.data})`);
          }
          const messageData = parsedMessage.data;
          if (!messageData) {
            throw Error(`No message data in (${event.data})`);
          }
          // NOTE(platfowner): A custom ping-pong (see https://github.com/ainblockchain/ain-js/issues/171).
          if (messageType === EventChannelMessageTypes.PING) {
            this.handlePing();
          } else {
            this.handleMessage(messageType, messageData);
          }
        } catch (err) {
          console.error(err);
        }
      };

      this._ws.onerror = async (event: unknown) => {
        console.error(event);
        this.disconnect();
      };

      this._ws.onopen = () => {
        this._isConnected = true;
        // Handshake timeout
        if (this._handshakeTimeout) {
          clearTimeout(this._handshakeTimeout);
          this._handshakeTimeout = null;
        }
        // Heartbeat timeout
        this.startHeartbeatTimer(DEFAULT_HEARTBEAT_INTERVAL_MS);
        resolve(this);
      };

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
   * Starts the handshake timer for the event channel.
   * @param {number} timeoutMs The timeout value in miliseconds.
   */
  startHandshakeTimer(timeoutMs: number) {
    this._handshakeTimeout = setTimeout(() => {
      console.error(`Handshake timeouted! Closing the websocket.`);
      this._ws!.close();
    }, timeoutMs);
  }

  /**
   * Starts the heartbeat timer for the event channel.
   * @param {number} timeoutMs The timeout value in miliseconds.
   */
  startHeartbeatTimer(timeoutMs: number) {
    this._heartbeatTimeout = setTimeout(() => {
      console.error(`Heartbeat timeouted! Closing the websocket.`);
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
   * Handles a ping message from the event channel.
   */
  handlePing() {
    this.sendPong();
    // Heartbeat timeout
    if (this._heartbeatTimeout) {
      clearTimeout(this._heartbeatTimeout);
      this._heartbeatTimeout = null;
    }
    this.startHeartbeatTimer(DEFAULT_HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Handles a (non-ping) message from the event channel.
   * 
   * @param {EventChannelMessageTypes} messageType The message type.
   * @param {any} messageData The message data.
   */
  handleMessage(messageType: EventChannelMessageTypes, messageData: any) {
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

  /**
   * Sends a pong message.
   */
  sendPong() {
    const pongMessage = this.buildMessage(EventChannelMessageTypes.PONG, {});
    this.sendMessage(pongMessage);
  }
}
