import Wallet from "../wallet";

/**
 * Signer takes responsibility to sign message and transaction.
 */
export interface Signer {
    /**
     * Return checksum address to use signing message.
     * @param {string} address
     */
    getAddress(address?: string): string;

    /**
     * Sign message using signer's account.
     * If user input specific address and signer has it, Message will be signed by the address.
     * @param {any} message
     * @param {string} address - The address registered to signer.
     */
    signMessage(message: any, address?: string): Promise<string> | string;
}

/**
 * DefaultSigner class takes responsibility to sign using the Wallet class.
 * When ain class is initialized, DefaultSigner is set.
 */
export class DefaultSigner implements Signer {
    readonly wallet: Wallet;

    constructor(wallet: Wallet) {
        this.wallet = wallet;
    }

    getAddress(address?: string): string {
        return this.wallet.getImpliedAddress(address);
    }

    signMessage(message: any, address?: string): Promise<string> | string {
        if (typeof message === 'string') {
            return this.wallet.sign(message, address);
        } else {
            return this.wallet.signTransaction(message, address);
        }
    }
}