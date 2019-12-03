import Provider from './provider';
import { version } from '../package.json';

export default class Network {
  public provider: Provider;
  public version: string;

  /**
   * @param {Provider} provider
   * @constructor
   */
  constructor (provider: Provider) {
    this.provider = provider;
    // TODO (lia): should get the following info from the node
    this.version = version;
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
    return new Promise((resolve, reject) => {
      // TODO (lia): get the following info from the node
      resolve("Testnet");
    });
  }

  /**
   * Returns the protocol version of the node.
   */
  getProtocolVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      // TODO (lia): get the following info from the node
      resolve("1.0.0");
    });
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
