import { TransactionBody, TransactionInput } from "../types";
import { Signer } from "./signer";

/**
 * A class of Signer interface for AIN Wallet chrome extension
 * (https://chrome.google.com/webstore/detail/ain-wallet/hbdheoebpgogdkagfojahleegjfkhkpl).
 */
export class AinWalletSigner implements Signer {
  /** The Ain Wallet object. */
  private ainetwork: Signer;
  
  /**
   * Creates a new AinWalletSigner object.
   * It initializes the Ain Wallet object using the global variable 'window'.
   */
  constructor() {
    if (window.ainetwork) {
      this.ainetwork = window.ainetwork;
    } else {
      throw new Error("Not found ain wallet object");
    }
  }

  /**
   * Gets an account's checksum address.
   * If the address is not given, the default account of the Ain Wallet is used.
   * @param {string} address The address of the account.
   * @returns {string} The checksum address.
   */
  getAddress(address?: string): string {
    return this.ainetwork.getAddress(address);
  }

  /**
   * Signs a message using an account.
   * If an address is not given, the default account of the Ain Wallet is used.
   * @param {string} message The message to sign.
   * @param {string} address The address of the account.
   * @returns {Promise<string> | string} The signature.
   */
  signMessage(message: any, address?: string): Promise<string> | string {
    return this.ainetwork.signMessage(message, address);
  }

  /**
   * Signs and sends a transaction to the network.
   * @param {TransactionInput} transactionObject The transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  sendTransaction(transactionObject: TransactionInput) {
    return this.ainetwork.sendTransaction(transactionObject);
  }

  /**
   * This method is not implemented yet.
   */
  sendTransactionBatch(transactionObjects: TransactionInput[]): Promise<any> {
    throw new Error("Method not implemented.");
  }

  /**
   * This method is not implemented yet.
   */
  sendSignedTransaction(signature: string, txBody: TransactionBody, isDryrun?: boolean | undefined): Promise<any> {
    throw new Error("Method not implemented.");
  }
}