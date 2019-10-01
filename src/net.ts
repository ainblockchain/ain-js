import { NodeInfo } from './types';
import Provider from './provider';
import { version } from '../package.json';

export default class Network {
  public provider: Provider;
  public version: string;
  public name?: string;
  public location?: string;

  constructor (provider: Provider) {
    this.provider = provider;
    this.version = version;
    this.name = "ComCom Node";
    this.location = "South Korea";
  }

  isListening(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      resolve(true);
    })
  }

  getNodeInfo(): Promise<NodeInfo | boolean> {
    return new Promise((resolve, reject) => {
      if (this.provider.endpoint) {
        let nodeInfo = {
          name: this.name,
          location: this.location,
          version: this.version,
          endpoint: this.provider.endpoint
        }
        resolve(nodeInfo);
      }
      resolve(false);
    })
  }

  getPeerCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.provider.endpoint) {
        resolve(9);
      } else {
        resolve(0);
      }
    })
  }

  isSyncing(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      resolve(false);
    })
  }
}
