import { DesiloSealFactory } from './desilo';
import { CipherText } from 'node-seal/implementation/cipher-text';
import { HomomorphicEncryptionSecretKey, HomomorphicEncryptionParams } from '../types';

const DEFAULT_PARAMS: HomomorphicEncryptionParams = {
  polyModulusDegree: 8192,
  coeffModulusArray: Int32Array.from([60, 40, 40, 60]),
  scaleBit: 40
};
export default class HomomorphicEncryption {
  public seal: any;
  private _initialized: boolean;

  constructor() {
    this.seal = null;
    this._initialized = false;
  }

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

  get initialized() {
    return this._initialized;
  }

  TEST_getKeys() {
    if (!this.initialized) {
      throw new Error('Cannot encode before initializing.');
    }
    return this.seal.getKeys();
  }

  encrypt(array: Float64Array) {
    if (!this.initialized) {
      throw new Error('Cannot encrypt before initializing.');
    }
    return this.seal.encrypt(array);
  }

  decrypt(cipherText: CipherText) {
    if (!this.initialized) {
      throw new Error('Cannot decrypt before initializing.');
    }
    return this.seal.decrypt(cipherText);
  }

  TEST_evaluate_double(cipherText: CipherText) {
    if (!this.initialized) {
      throw new Error('Cannot evaluate before initializing.');
    }
    return this.seal.evaluator.add(cipherText, cipherText, cipherText);
  }
}