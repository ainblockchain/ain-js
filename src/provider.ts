import axios, { AxiosInstance } from 'axios';
import * as parseUrl from 'url-parse';
import { get } from 'lodash';
import Ain from './ain';
import { PROTO_VER_INCOMPAT_ERROR } from './constants';
const JSON_RPC_ENDPOINT = 'json-rpc';
const PROTO_VER_METHODS = [ 'ain_getProtocolVersion', 'ain_checkProtocolVersion' ];

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
    const result = get(response, 'data.result.result', null);
    const code = get(response, 'data.result.code');
    const message = get(response, 'data.message');
    const nodeProtoVer = get(response, 'data.result.protoVer', '');
    if (message === PROTO_VER_INCOMPAT_ERROR) {
      return response.data;
    }
    if (!PROTO_VER_METHODS.includes(rpcMethod) && !this.ain.net.setProtoVer(nodeProtoVer)) {
      return null;
    }
    return code !== undefined ? response.data.result : result;
  }

  /**
   * Sets the httpClient's default timeout time
   * @param {number} time (in milliseconds)
   */
  setDefaultTimeoutMs(time: number) {
    this.httpClient.defaults.timeout = time;
  }
}
