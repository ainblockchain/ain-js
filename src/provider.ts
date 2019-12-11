import axios from 'axios';
import request from './request';
import Ain from './ain';
const JSON_RPC_ENDPOINT = '/json-rpc/';

export default class Provider {
  public endpoint: string;
  private ain: Ain;

  /**
   * @param {String} endpoint
   * @constructor
   */
  constructor(ain: Ain, endpoint: string) {
    this.ain = ain;
    this.endpoint = endpoint;
  }

  /**
   * Creates the JSON-RPC payload and sends it to the node.
   * @param {string} rpcMethod
   * @param {any} data
   * @return {Promise<any>}
   */
  send(rpcMethod: string, data?: any): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const message = {
        jsonrpc: "2.0",
        method: rpcMethod,
        params: Object.assign(data || {}, { protoVer: this.ain.net.protoVer }),
        id: 0
      };
      const response = await axios.post(this.endpoint + JSON_RPC_ENDPOINT, message)
      .catch(error => {
        reject(error);
      });
      if (response && response.data && response.data.result) {
        if (response.data.result.code !== undefined ||
            response.data.result.result === undefined) {
          resolve(response.data.result);
        } else {
          resolve(response.data.result.result === undefined ? null
              : response.data.result.result);
        }
      } else {
        resolve(null);
      }
    });
  }
}
