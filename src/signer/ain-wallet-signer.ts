import {Signer} from "./signer";

export class AinWalletSigner implements Signer {
  private ainetwork: Signer;
  constructor() {
    if (window.ainetwork) {
      this.ainetwork = window.ainetwork;
    } else {
      throw new Error("Not found ain wallet object");
    }
  }
  getAddress(address?: string): string {
    return this.ainetwork.getAddress(address);
  }

  signMessage(message: any, address?: string): Promise<string> | string {
    return this.ainetwork.signMessage(message, address);
  }
}