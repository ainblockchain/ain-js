import axios, { AxiosInstance } from 'axios';
import * as parseUrl from 'url-parse';
import { get } from 'lodash';
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
   * @param {any} params
   * @return {Promise<any>}
   */
  async send(rpcMethod: string, params?: any): Promise<any> {
    const data = {
      jsonrpc: "2.0",
      method: rpcMethod,
      params: Object.assign(params || {}, { protoVer: this.ain.net.protoVer }),
      id: 0
    };
    const response = await this.httpClient.post(this.apiEndpoint, data);
    const rawResult = get(response, 'data.result');
    if (typeof rawResult !== 'object' || !(rawResult.code === undefined || rawResult.code === 0)) {
      throw new Error(JSON.stringify(rawResult));
    }
    return rawResult.code !== undefined ? rawResult : get(rawResult, 'result', null);
  }

  /**
   * Sets the httpClient's default timeout time
   * @param {number} time (in milliseconds)
   */
  setDefaultTimeoutMs(time: number) {
    this.httpClient.defaults.timeout = time;
  }
}
