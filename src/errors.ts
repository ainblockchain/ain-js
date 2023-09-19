/**
 * A class for blockchain errors.
 */
export class BlockchainError extends Error {
  /** The error code. */
  public code: number;

  /**
   * Creates a new BlockchainError object.
   * @param {number} code The error code.
   * @param {string} message The error message.
   */
  constructor(code: number, message: string) {
    super(message);
    // NOTE(platfowner): https://stackoverflow.com/questions/68899615/how-to-expect-a-custom-error-to-be-thrown-with-jest
    Object.setPrototypeOf(this, BlockchainError.prototype);

    this.name = this.constructor.name;
    this.code = code;
    this.message = message;
  }
}
