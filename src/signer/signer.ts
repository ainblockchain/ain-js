import { TransactionBody, TransactionInput } from "../types";

/**
 * An interface for signing messages and transactions.
 */
export interface Signer {
  /**
   * Returns the checksum address to sign messages with.
   * If the address is not given, the default address of the signer is used.
   * @param {string} address - The address of the account to sign the message with.
   */
  getAddress(address?: string): string;

  /**
   * Signs a message with the private key of the given address.
   * If an address is not given, the default address of the signer is used.
   * @param {string} message - The message to sign.
   * @param {string} address - The address of the account to sign the message with.
   */
  signMessage(message: string, address?: string): Promise<string> | string;

  /**
   * Signs and sends a transaction to the network.
   * @param {TransactionInput} transactionObject
   * @param {boolean} isDryrun - dryrun option.
   * @return {Promise<any>}
   */
  sendTransaction(transactionObject: TransactionInput, isDryrun?: boolean);

  /**
   * Sends signed transactions to the network.
   * @param {TransactionInput[]} transactionObjects
   */
  sendTransactionBatch(transactionObjects: TransactionInput[]): Promise<any>

  /**
   * Sends a signed transaction to the network
   * @param {string} signature
   * @param {TransactionBody} txBody
   * @param {boolean} isDryrun - dryrun option.
   * @return {Promise<any>}
   */
  sendSignedTransaction(signature: string, txBody: TransactionBody, isDryrun?: boolean): Promise<any>
}
