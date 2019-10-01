import request from './request';
import Ain from './ain';

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
  send(rpcMethod: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      request('mock_send/').then(res => {
        if (rpcMethod === 'ain_sendSignedTransaction') {
          try {
            resolve('0x'+Ain.ainUtil.hashTransaction(data).toString('hex'));
          } catch(e) {
            reject(e);
          }
        } else {
          resolve(res);
        }
      });
    });
  }
}
