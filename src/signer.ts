import Wallet from "./wallet";

export interface Signer {
    getAddress(address?: string): string;
    signMessage(message: any, address?: string): Promise<string> | string;
}

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