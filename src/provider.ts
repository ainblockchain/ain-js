import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as parseUrl from 'url-parse';
import { get } from 'lodash';
import Ain from './ain';
import { BlockchainError } from './errors';

const JSON_RPC_ENDPOINT = 'json-rpc';

/**
 * A class for providing JSON-RPC channels with blockchain node endpoints.
 */
export default class Provider {
  /** The blockchain node endpoint. */
  public endpoint: string;
  /** The blockchain node JSON-RPC endpoint. */
  public apiEndpoint: string;
  /** The Ain object. */
  private ain: Ain;
  /** The axios http client object. */
  private httpClient: AxiosInstance;

  /**
   * Creates a new Provider object.
   * @param {Ain} ain The Ain object.
   * @param {string} endpoint The blockchain node endpoint.
   * @param {AxiosRequestConfig} axiosConfig The axios request config object.
   */
  constructor(ain: Ain, endpoint: string, axiosConfig: AxiosRequestConfig | undefined) {
    this.ain = ain;
    let parsed = parseUrl(endpoint);
    if (parsed && parsed.origin !== 'null') {
      this.endpoint = parsed.origin;
      this.apiEndpoint = [this.endpoint, JSON_RPC_ENDPOINT].join('/');
    } else {
      throw Error('Invalid endpoint received.');
    }
    this.httpClient = axios.create(axiosConfig);
  }

  /**
   * Fetches the blockchain node's address.
   * @returns {Promise<string>} The return value of the blockchain API.
   */
  getAddress(): Promise<string> {
    return this.send('ain_getAddress', {})
  }

  /**
   * Creates a JSON-RPC payload and sends it to the network.
   * @param {string} rpcMethod The JSON-RPC method.
   * @param {any} params The JSON-RPC parameters.
   * @returns {Promise<any>}
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
    if (this.ain.rawResultMode) {
      return rawResult;
    }
    if (typeof rawResult !== 'object' || !(rawResult.code === undefined || rawResult.code === 0)) {
      throw new BlockchainError(rawResult.code, rawResult.message);
    }
    return rawResult.code !== undefined ? rawResult : get(rawResult, 'result', null);
  }

  /**
   * Sets the http client's default timeout value.
   * @param {number} time The timeout value (in milliseconds).
   */
  setDefaultTimeoutMs(time: number) {
    this.httpClient.defaults.timeout = time;
  }
}
