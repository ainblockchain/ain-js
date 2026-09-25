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
    const layer = this.ain.executionLayer;
    if (layer && params?.layer !== undefined && params.layer !== layer) {
      throw Error('RPC layer differs from the pinned signing domain');
    }
    return this.request(rpcMethod, { ...params, ...(layer ? { layer } : {}) });
  }

  /** Read an inner inbox transaction's nonce without changing the client's signing layer. */
  async sendLayerRead(rpcMethod: string, params: any, layer: 'L1' | 'L2'): Promise<any> {
    if (!['ain_getNonce', 'ain_getTimestamp'].includes(rpcMethod) || !this.ain.layerCapabilities?.layers?.[layer]) {
      throw Error('Unsupported cross-layer read');
    }
    return this.request(rpcMethod, { ...params, layer });
  }

  private async request(rpcMethod: string, params?: any): Promise<any> {
    const data = {
      jsonrpc: "2.0",
      method: rpcMethod,
      params: { ...params, protoVer: this.ain.net.protoVer },
      id: 0
    };
    const response = await this.httpClient.post(this.apiEndpoint, data);
    const rpcError = get(response, 'data.error');
    if (rpcError) throw new BlockchainError(rpcError.code, rpcError.message);
    const rawResult = get(response, 'data.result');
    if (this.ain.rawResultMode) {
      return rawResult;
    }
    if (!rawResult || typeof rawResult !== 'object' || !(rawResult.code === undefined || rawResult.code === 0)) {
      throw new BlockchainError(rawResult?.code, rawResult?.message || 'Invalid RPC response');
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
