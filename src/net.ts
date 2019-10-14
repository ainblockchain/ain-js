import { NodeInfo } from './types';
import Provider from './provider';
import { version } from '../package.json';

export default class Network {
  public provider: Provider;
  public version: string;
  public name?: string;
  public location?: string;

  /**
   * @param {Provider} provider
   * @constructor
   */
  constructor (provider: Provider) {
    this.provider = provider;
    this.version = version;
    this.name = "ComCom Node";
    this.location = "South Korea";
  }

  /**
   * Returns whether the node is listening for network connections.
   * @return {Promise<boolean>}
   */
  isListening(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      resolve(true);
    })
  }

  /**
   * Returns the node's information.
   * @return {Promise<NodeInfo>}
   */
  getNodeInfo(): Promise<NodeInfo | boolean> {
    return new Promise((resolve, reject) => {
      let nodeInfo = {
        name: this.name,
        location: this.location,
        version: this.version,
        endpoint: this.provider.endpoint
      }
      resolve(nodeInfo);
    })
  }

  /**
   * Returns the number of peers the provideri node is connected to.
   * @return {Promise<number>}
   */
  getPeerCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      resolve(9);
    })
  }

  /**
   * Returns whether the node is syncing with the network or not.
   * @return {Promise<boolean>}
   */
  isSyncing(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      resolve(false);
    })
  }
}
