import { DesiloSealFactory } from './desilo';
import { CipherText } from 'node-seal/implementation/cipher-text';
import { HomomorphicEncryptionSecretKey, HomomorphicEncryptionParams } from '../types';

const DEFAULT_PARAMS: HomomorphicEncryptionParams = {
  polyModulusDegree: 8192,
  coeffModulusArray: Int32Array.from([60, 40, 40, 60]),
  scaleBit: 40
};

/**
 * A class for homorphic encryption based on the Desilo's HE solution.
 */
export default class HomomorphicEncryption {
  /** The DesiloSeal object. */
  public seal: any;
  /** Whether the class is initialized or not. */
  private _initialized: boolean;

  /**
   * Creates a new HomorphicEncryption obect.
   */
  constructor() {
    this.seal = null;
    this._initialized = false;
  }

  /**
   * Initializes the class with keys and parameters.
   * @param {HomomorphicEncryptionSecretKey | null} keys The secret key.
   * @param {HomomorphicEncryptionParams | null} params The homorphic encryption parameters.
   */
  async init(keys?: HomomorphicEncryptionSecretKey | null, params?: HomomorphicEncryptionParams | null) {
    this.seal = await DesiloSealFactory(keys, params ? params : DEFAULT_PARAMS);
    if (!this.seal) {
      this._initialized = false;
      throw new Error('Failed to initialize.');
    }
    if (!this.seal.context.parametersSet()) {
      this._initialized = false;
      throw new Error(
        'Could not set the parameters in the given context. Please try different encryption parameters.'
      );
    }
    this._initialized = true;
  }

  /**
   * Getter for _initialized.
   */
  get initialized() {
    return this._initialized;
  }

  /**
   * Returns the key set currently in use.
   * It temporarily returns the secret key only due to memory issues.
   * This is a method for test purposes only.
   * @returns {Object} The key set.
   */
  TEST_getKeys(): Object {
    if (!this.initialized) {
      throw new Error('Cannot encode before initializing.');
    }
    return this.seal.getKeys();
  }

  /**
   * Encrypts a length-fixed array into a ciphertext.
   * @param {Float64Array} array The array of length poly_mod_degree / 2.
   * @returns {CipherText} The cipertext encrypted.
   */
  encrypt(array: Float64Array): CipherText {
    if (!this.initialized) {
      throw new Error('Cannot encrypt before initializing.');
    }
    return this.seal.encrypt(array);
  }

  /**
   * Decrypts a ciphertext to an float64 array.
   * @param {CipherText} cipherText The ciphertext.
   * @returns {Float64Array} The float64 array decrypted.
   */
  decrypt(cipherText: CipherText): Float64Array {
    if (!this.initialized) {
      throw new Error('Cannot decrypt before initializing.');
    }
    return this.seal.decrypt(cipherText);
  }

  /**
   * Doubles an input cipher text and performs a homorphic calculation on it.
   * This is a method for test purposes only.
   * @returns {Object} The result of the homorphic calculation.
   */
  TEST_evaluate_double(cipherText: CipherText): Object {
    if (!this.initialized) {
      throw new Error('Cannot evaluate before initializing.');
    }
    return this.seal.evaluator.add(cipherText, cipherText, cipherText);
  }
}