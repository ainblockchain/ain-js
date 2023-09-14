import { TransactionBody } from "@ainblockchain/ain-util";
import Provider from "../provider";
import Wallet from "../wallet";
import { Signer } from "./signer";
import { TransactionInput } from "../types";
import Ain from "../ain";

/**
 * The default class of Signer interface implemented using Wallet class.
 * When Ain class is initialized, DefaultSigner is set as its signer.
 */
export class DefaultSigner implements Signer {
  readonly wallet: Wallet;
  readonly provider: Provider;

  /**
   * Initializes the class.
   * @param {Wallet} wallet - The wallet to initialize with.
   */
  constructor(wallet: Wallet, provider: Provider) {
    this.wallet = wallet;
    this.provider = provider;
  }

  /**
   * Returns the checksum address to sign messages with.
   * If the address is not given, the default address of the wallet is used.
   * @param {string} address - The address of the account to sign the message with.
   */
  getAddress(address?: string): string {
    return this.wallet.getImpliedAddress(address);
  }

  /**
   * Signs a message with the private key of the given address.
   * If an address is not given, the default address of the wallet is used.
   * @param {string} message - The message to sign.
   * @param {string} address - The address of the account to sign the message with.
   */
  signMessage(message: string, address?: string): Promise<string> | string {
    return this.wallet.sign(message, address);
  }

  /**
   * Signs and sends a transaction to the network.
   * @param {TransactionInput} transactionObject
   * @param {boolean} isDryrun - dryrun option.
   * @return {Promise<any>}
   */
  async sendTransaction(transactionObject: TransactionInput, isDryrun: boolean = false) {
    const txBody = await this.buildTransactionBody(transactionObject);
    const signature = await this.wallet.signTransaction(txBody, transactionObject.address);
    return await this.sendSignedTransaction(signature, txBody, isDryrun);
  }

  /**
   * Sends signed transactions to the network.
   * @param {TransactionInput[]} transactionObjects
   */
  async sendTransactionBatch(transactionObjects: TransactionInput[]): Promise<any> {
    let promises: Promise<any>[] = [];
    for (let tx of transactionObjects) {
      promises.push(this.buildTransactionBody(tx).then(async (txBody) => {
        if (tx.nonce === undefined) {
          // Batch transactions' nonces should be specified.
          // If they're not, they default to un-nonced (nonce = -1).
          txBody.nonce = -1;
        }
        const signature = await this.wallet.signTransaction(txBody, tx.address);
        return { signature, tx_body: txBody };
      }));
    }
    return Promise.all(promises).then(async (tx_list) => {
      const resultList = await this.provider.send('ain_sendSignedTransactionBatch', { tx_list });
      if (!Array.isArray(resultList)) {
        return resultList;
      }
      const len = resultList.length;
      if (len !== tx_list.length) {
        return resultList;
      } else {
        for (let i = 0; i < len; i++) {
          if (!resultList[i] || typeof resultList[i] !== 'object') {
            resultList[i] = { result: resultList[i] };
          }
        }
        return resultList;
      }
    })
  }

  /**
   * Sends a signed transaction to the network
   * @param {string} signature
   * @param {TransactionBody} txBody
   * @param {boolean} isDryrun - dryrun option.
   * @return {Promise<any>}
   */
  async sendSignedTransaction(signature: string, txBody: TransactionBody, isDryrun: boolean = false): Promise<any> {
    const method = isDryrun ? 'ain_sendSignedTransactionDryrun' : 'ain_sendSignedTransaction';
    let result = await this.provider.send(method, { signature, tx_body: txBody });
    if (!result || typeof result !== 'object') {
      result = { result };
    }
    return result;
  }

  /**
   * Builds a transaction body from transaction input.
   * @param {TransactionInput} transactionInput
   * @return {Promise<TransactionBody>}
   */
  async buildTransactionBody(transactionInput: TransactionInput): Promise<TransactionBody> {
    const address = this.getAddress(transactionInput.address);
    let tx = {
      operation: transactionInput.operation,
      parent_tx_hash: transactionInput.parent_tx_hash
    }
    let nonce = transactionInput.nonce;
    if (nonce === undefined) {
      nonce = await this.getNonce({ address, from: "pending" });
    }
    const timestamp = transactionInput.timestamp ? transactionInput.timestamp : Date.now();
    const gasPrice = transactionInput.gas_price || 0;
    const billing = transactionInput.billing;
    return Object.assign(tx, { nonce, timestamp, gas_price: gasPrice, billing });
  }

  /**
   * Returns the current transaction count of account, which is the nonce of the account.
   * @param {object} args - May contain a string 'address' and a string 'from' values.
   *                        The 'address' indicates the address of the account to get the
   *                        nonce of, and the 'from' indicates where to get the nonce from.
   *                        It could be either the pending transaction pool ("pending") or
   *                        the committed blocks ("committed"). The default value is "committed".
   * @return {Promise<number>}
   */
  getNonce(args: { address?: string, from?: string }): Promise<number> {
    if (!args) { args = {}; }
    const address = args.address ? Ain.utils.toChecksumAddress(args.address)
      : this.getAddress(args.address);
    if (args.from !== undefined && args.from !== 'pending' && args.from !== 'committed') {
      throw Error("'from' should be either 'pending' or 'committed'");
    }
    return this.provider.send('ain_getNonce', { address, from: args.from })
  }
}