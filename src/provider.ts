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
  async send(rpcMethod: string, data?: any): Promise<any> {
      const message = {
        jsonrpc: "2.0",
        method: rpcMethod,
        params: Object.assign(data || {}, { protoVer: this.ain.net.protoVer }),
        id: 0
      };
      const response = await axios.post(this.endpoint + JSON_RPC_ENDPOINT, message)
      if (response && response.data && response.data.result) {
        if (response.data.result.code !== undefined ||
            response.data.result.result === undefined) {
        return response.data.result;
        } else {
        return response.data.result.result === undefined ? null
            : response.data.result.result;
        }
      } else {
      return null;
      }
  }
}
