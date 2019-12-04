import axios from 'axios';
import request from './request';
import Ain from './ain';
const JSON_RPC_ENDPOINT = '/json-rpc/';

export default class Provider {
  public endpoint: string;

  /**
   * @param {String} endpoint
   * @constructor
   */
  constructor(endpoint: string) {
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
        params: data || {},
        id: 0
      };
      const response = await axios.post(this.endpoint + JSON_RPC_ENDPOINT, message)
      .catch(error => {
        reject(error);
      });
      resolve(response && response.data ? response.data.result : null);
    });
  }
}
