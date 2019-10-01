import * as EventEmitter from 'EventEmitter3';
import { PromiEvent } from '../promi-event';
import { TransactionBody, TransactionInput } from '../types';
import Ain from '../ain';

export default class AbstractPromiEventMethod {
  /**
   * @param {String} rpcMethod
   * @param {Ain} ain
   * @param {TransactionInput | TransactionBody} tx
   * @param {String} signature
   *
   * @constructor
   */

  public promiEvent: PromiEvent<any>;
  private _rpcMethod: string;
  private _ain: Ain;
  private _tx: TransactionInput | TransactionBody;
  private _signature: string;

  constructor(
      rpcMethod: string,
      ain: Ain,
      tx: TransactionInput | TransactionBody,
      signature?: string
  ) {
    if (Ain.instanceofTransactionBody(tx) && signature === undefined) {
      throw new Error("A signature should be provided with a transaction body.");
    }
    this.promiEvent = new PromiEvent();
    this._ain = ain;
    this._rpcMethod = rpcMethod;
    this._tx = tx;
    this._signature = signature || "";
  }

  /**
   * This method will be executed before the RPC request.
   *
   * @method beforeExecution
   *
   */
  async beforeExecution(): Promise<TransactionBody> {
    if (Ain.instanceofTransactionBody(this._tx)) {
      return this._tx;
    } else {
      const txBody: TransactionBody = await this._ain.buildTransactionBody(this._tx);
      return txBody;
    }
  }

  /**
   * Sends a JSON-RPC call request
   *
   * @method execute
   *
   * @returns {Promise<any>}
   */
  execute(): PromiEvent<any> {
    this.beforeExecution()
    .then((txBody) => {
      let signature = Ain.instanceofTransactionBody(this._tx) ? this._signature :
          this._ain.wallet.signTransaction(txBody, this._tx.address);
      this._ain.provider
      .send(this.rpcMethod, { signature, body: txBody })
      .then((txHash) => {
        this.promiEvent.eventEmitter.emit('tx_hash', txHash);
        this.promiEvent.resolve(txHash);

        // TODO (lia): subscribe to the transaction and get confirmations
        process.nextTick(() => {
          this.promiEvent.eventEmitter.emit(
              'result',
              { status: true, tx_hash: txHash, tx: txBody }
            );
        });

      })
      .catch((error) => {
        this.handleError(error, false, 0);
      });
    });
    return this.promiEvent;
  }

  /**
   * Getter for the rpcMethod property
   *
   * @property rpcMethod
   *
   * @returns {String}
   */
  get rpcMethod() {
    return this._rpcMethod;
  }

  /**
   * This methods calls the correct error methods of the PromiEvent object.
   *
   * @method handleError
   *
   * @param {Error} error
   * @param {Object} receipt
   * @param {Number} confirmations
   */
  handleError(error, result, confirmations) {
    if (this.promiEvent.eventEmitter.listenerCount('error') > 0) {
      this.promiEvent.eventEmitter.emit('error', error, result, confirmations);
      this.promiEvent.eventEmitter.removeAllListeners();
      return;
    }
    this.promiEvent.reject(error);
  }
}
