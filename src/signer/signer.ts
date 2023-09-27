import { TransactionBody, TransactionInput } from "../types";

/**
 * An interface for signing messages and transactions.
 */
export interface Signer {
  /**
   * Gets an account's checksum address.
   * If the address is not given, the default account of the signer is used.
   * @param {string} address The address of the account.
   * @returns {string} The checksum address.
   */
  getAddress(address?: string): string;

  /**
   * Signs a message using an account.
   * If an address is not given, the default account of the signer is used.
   * @param {string} message The message to sign.
   * @param {string} address The address of the account.
   * @returns {Promise<string> | string} The signature.
   */
  signMessage(message: string, address?: string): Promise<string> | string;

  /**
   * Signs and sends a transaction to the network.
   * @param {TransactionInput} transactionObject The transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  sendTransaction(transactionObject: TransactionInput, isDryrun?: boolean);

  /**
   * Signs and sends multiple transactions in a batch to the network.
   * @param {TransactionInput[]} transactionObjects The list of the transaction input objects.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  sendTransactionBatch(transactionObjects: TransactionInput[]): Promise<any>

  /**
   * Sends a signed transaction to the network.
   * @param {string} signature The signature.
   * @param {TransactionBody} txBody The transaction body.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  sendSignedTransaction(signature: string, txBody: TransactionBody, isDryrun?: boolean): Promise<any>
}
