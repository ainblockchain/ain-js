import axios, { AxiosInstance } from 'axios';
import * as parseUrl from 'url-parse';
import Ain from './ain';
const JSON_RPC_ENDPOINT = 'json-rpc';

export default class Provider {
  public endpoint: string;
  public apiEndpoint: string;
  private ain: Ain;
  private httpClient: AxiosInstance;

  /**
   * @param {String} endpoint
   * @constructor
   */
  constructor(ain: Ain, endpoint: string) {
    this.ain = ain;
    let parsed = parseUrl(endpoint);
    if (parsed && parsed.origin !== 'null') {
      this.endpoint = parsed.origin;
      this.apiEndpoint = [this.endpoint, JSON_RPC_ENDPOINT].join('/');
    } else {
      throw Error('Invalid endpoint received.');
    }
    this.httpClient = axios.create();
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
    const response = await this.httpClient.post(this.apiEndpoint, message);
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

  /**
   * Sets the httpClient's default timeout time
   * @param {number} time
   */
  setDefaultTimeoutMs(time: number) {
    this.httpClient.defaults.timeout = time;
  }
}
