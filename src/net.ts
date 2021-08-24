import * as semver from 'semver';
import Provider from './provider';
import { BLOCKCHAIN_PROTOCOL_VERSION } from './constants';

export default class Network {
  public provider: Provider;
  public protoVer: string;

  /**
   * @param {Provider} provider
   * @constructor
   */
  constructor (provider: Provider) {
    this.provider = provider;
    this.protoVer = BLOCKCHAIN_PROTOCOL_VERSION;
  }

  /**
   * Returns whether the node is listening for network connections.
   * @return {Promise<boolean>}
   */
  isListening(): Promise<boolean> {
    return this.provider.send('net_listening');
  }

  /**
   * Returns the id of the network the node is connected to.
   */
  getNetworkId(): Promise<string> {
    return this.provider.send('net_getNetworkId');
  }

  /**
   * Checks the protocol version
   */
  async checkProtocolVersion(): Promise<any> {
    return this.provider.send('ain_checkProtocolVersion');
  }

  /**
   * Returns the protocol version of the node.
   */
  getProtocolVersion(): Promise<string> {
    return this.provider.send('ain_getProtocolVersion');
  }

  /**
   * Returns the number of peers the provider node is connected to.
   * @return {Promise<number>}
   */
  getPeerCount(): Promise<number> {
    return this.provider.send('net_peerCount');
  }

  /**
   * Returns whether the node is syncing with the network or not.
   * @return {Promise<boolean>}
   */
  isSyncing(): Promise<boolean> {
    return this.provider.send('net_syncing');
  }
}
