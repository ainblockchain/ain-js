import * as semver from 'semver';
import Provider from './provider';
import { BLOCKCHAIN_PROTOCOL_VERSION } from './constants';

/**
 * A class for checking the blockchain node status.
 */
export default class Network {
  /** The network provider. */
  public provider: Provider;
  /** The protocol version. */
  public protoVer: string;

  /**
   * Creates a new Network object.
   * @param {Provider} provider The network provider.
   */
  constructor (provider: Provider) {
    this.provider = provider;
    this.protoVer = BLOCKCHAIN_PROTOCOL_VERSION;
  }

  /**
   * Checks whether the blockchain node is listening for network connections.
   * @returns {Promise<boolean>}
   */
  isListening(): Promise<boolean> {
    return this.provider.send('net_listening');
  }

  /**
   * Fetches the ID of the network the blokchain node is connected to.
   */
  getNetworkId(): Promise<string> {
    return this.provider.send('net_getNetworkId');
  }

  /**
   * Checks the protocol version compatibility with the blockchain node.
   */
  async checkProtocolVersion(): Promise<any> {
    return this.provider.send('ain_checkProtocolVersion');
  }

  /**
   * Fetches the protocol version of the blockchain node.
   */
  getProtocolVersion(): Promise<any> {
    return this.provider.send('ain_getProtocolVersion');
  }

  /**
   * Fetches the number of the peers the blockchain node is connected to.
   * @returns {Promise<number>}
   */
  getPeerCount(): Promise<number> {
    return this.provider.send('net_peerCount');
  }

  /**
   * Checks whether the blockchain node is syncing with the network or not.
   * @returns {Promise<boolean>}
   */
  isSyncing(): Promise<boolean> {
    return this.provider.send('net_syncing');
  }

  /**
   * Fetches the event handler network information.
   */
  getEventHandlerNetworkInfo(): Promise<any> {
    return this.provider.send('net_getEventHandlerNetworkInfo');
  }
}
