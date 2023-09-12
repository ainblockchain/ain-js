import Wallet from "../wallet";

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
     * @param {any} message - The message to sign.
     * @param {string} address - The address of the account to sign the message with.
     */
    signMessage(message: any, address?: string): Promise<string> | string;
}

/**
 * The default class of Signer interface implemented using Wallet class.
 * When Ain class is initialized, DefaultSigner is set as its signer.
 */
export class DefaultSigner implements Signer {
    readonly wallet: Wallet;

    /**
     * Initializes the class.
     * @param {Wallet} wallet - The wallet to initialize with.
     */
    constructor(wallet: Wallet) {
        this.wallet = wallet;
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
     * @param {any} message - The message to sign.
     * @param {string} address - The address of the account to sign the message with.
     */
    signMessage(message: any, address?: string): Promise<string> | string {
        if (typeof message === 'string') {
            return this.wallet.sign(message, address);
        } else {
            return this.wallet.signTransaction(message, address);
        }
    }
}