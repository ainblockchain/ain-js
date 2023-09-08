import { Signer } from "./signer";

/**
 * A signer class for AIN Wallet chrome extension
 * (https://chrome.google.com/webstore/detail/ain-wallet/hbdheoebpgogdkagfojahleegjfkhkpl).
 */
export class AinWalletSigner implements Signer {
  private ainetwork: Signer;
  
  /**
   * Initializes the class based on the AIN Wallet's global variable.
   */
  constructor() {
    if (window.ainetwork) {
      this.ainetwork = window.ainetwork;
    } else {
      throw new Error("Not found ain wallet object");
    }
  }

  /**
   * Returns the checksum address to sign messages with.
   * If the address is not given, the default address of the wallet is used.
   * @param {string} address - The address of the account to sign the message with.
   */
  getAddress(address?: string): string {
    return this.ainetwork.getAddress(address);
  }

  /**
   * Signs a message with the private key of the given address.
   * If an address is not given, the default address of the wallet is used.
   * @param {any} message - The message to sign.
   * @param {string} address - The address of the account to sign the message with.
   */
  signMessage(message: any, address?: string): Promise<string> | string {
    return this.ainetwork.signMessage(message, address);
  }
}