import Ain from '../ain';

/**
 * AIN-token x402 scheme client for local testnet.
 * When a 402 response is received, parses the payment requirements,
 * executes an AIN wallet.transfer(), and returns the txHash as payment proof.
 *
 * This implements the x402 client interface expected by @x402/fetch's
 * wrapFetchWithPayment().
 */
export class AinTransferSchemeClient {
  private _ain: Ain;

  constructor(ain: Ain) {
    this._ain = ain;
  }

  /**
   * Called by wrapFetchWithPayment when a 402 response is received.
   * Parses payment requirements and executes an AIN transfer.
   */
  async handlePaymentRequired(
    paymentRequirements: any,
    _response: Response
  ): Promise<{ payload: any }> {
    // paymentRequirements may be an array; pick the ain-transfer scheme
    const reqs = Array.isArray(paymentRequirements) ? paymentRequirements : [paymentRequirements];
    const req = reqs.find((r: any) => r.scheme === 'ain-transfer') || reqs[0];

    const payTo: string = req.payTo || req.payToAddress || req.recipient;
    const amount: number = Number(req.maxAmountRequired || req.amount || req.price);

    if (!payTo || !amount) {
      throw new Error(
        `[AinTransferSchemeClient] Invalid payment requirement: payTo=${payTo}, amount=${amount}`
      );
    }

    // Execute AIN transfer
    const fromAddress = this._ain.signer.getAddress();
    const txResult = await this._ain.wallet.transfer({
      from: fromAddress,
      to: payTo,
      value: amount,
    });

    // Extract tx hash from result
    const txHash = txResult?.tx_hash || txResult?.txHash || '';
    if (!txHash) {
      throw new Error(
        `[AinTransferSchemeClient] Transfer did not return tx_hash. Result: ${JSON.stringify(txResult)}`
      );
    }

    return {
      payload: {
        scheme: 'ain-transfer',
        network: 'ain:local',
        txHash,
        from: fromAddress,
        to: payTo,
        amount,
      },
    };
  }
}
