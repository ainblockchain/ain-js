import request from './request';
import Ain from './ain';

export default class Provider {
  public endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

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
