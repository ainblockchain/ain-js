import semver from 'semver';
import Provider from './provider';
const VERSION_LIST = require('./protocol_versions.json');
const SDK_VERSION = require('./package.alias.json').version;

export default class Network {
  public provider: Provider;
  public protoVer: string;

  /**
   * @param {Provider} provider
   * @constructor
   */
  constructor (provider: Provider) {
    this.provider = provider;
    if (!VERSION_LIST[SDK_VERSION]) {
      throw Error("Current sdk version doesn't exist in the list");
    }
    // Will try to use the max protocol version supported
    // by this sdk's version first. If the max version is not
    // supported by the connected node, it will try to adjust
    // the protoVer to the node's, if possible.
    this.protoVer = VERSION_LIST[SDK_VERSION].max;
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

  checkProtocolVersion(): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const response = await this.provider.send('ain_checkProtocolVersion');
      if (response.code === 1) {
        const nodeProtoVer = response.protoVer;
        if (semver.lte(VERSION_LIST[SDK_VERSION].min, nodeProtoVer) &&
              (!VERSION_LIST[SDK_VERSION].max ||
                  semver.gte(VERSION_LIST[SDK_VERSION].max, nodeProtoVer))) {
          console.log("Trying to adjust our protoVer to the node's..");
          // Update protoVer if we can
          this.protoVer = nodeProtoVer;
          const res = await this.provider.send('ain_checkProtocolVersion');
          resolve(res);
        }
      }
      resolve(response);
    });
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
