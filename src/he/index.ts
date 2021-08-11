const SEAL = require('node-seal');
import { SEALLibrary } from 'node-seal/implementation/seal';
import { EncryptionParameters } from 'node-seal/implementation/encryption-parameters';
import { Context } from 'node-seal/implementation/context';
import { KeyGenerator } from 'node-seal/implementation/key-generator';
import { BatchEncoder, BatchEncoderTypes } from 'node-seal/implementation/batch-encoder';
import { Encryptor } from 'node-seal/implementation/encryptor';
import { Decryptor } from 'node-seal/implementation/decryptor';
import { Evaluator } from 'node-seal/implementation/evaluator';
import { PlainText } from 'node-seal/implementation/plain-text';
import { CipherText } from 'node-seal/implementation/cipher-text';

export default class HomomorphicEncryption {
  public seal: SEALLibrary | null;
  public encParams: EncryptionParameters | undefined;
  public context: Context | undefined;
  public keyGenerator: KeyGenerator | undefined;
  public encoder: BatchEncoder | undefined;
  public encryptor: Encryptor | undefined;
  public decryptor: Decryptor | undefined;
  public evaluator: Evaluator | undefined;
  private _initialized: boolean;

  constructor() {
    this.seal = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;
    this.seal = await SEAL();
    if (!this.seal) {
      throw new Error('Failed to initialize.');
    }
    const schemeType = this.seal.SchemeType.bfv;
    const securityLevel = this.seal.SecurityLevel.tc128;
    const polyModulusDegree = 4096;
    const bitSizes = [36, 36, 37];
    const bitSize = 20;

    this.encParams = this.seal.EncryptionParameters(schemeType);

    // Set the PolyModulusDegree
    this.encParams.setPolyModulusDegree(polyModulusDegree);

    // Create a suitable set of CoeffModulus primes
    this.encParams.setCoeffModulus(
      this.seal.CoeffModulus.Create(polyModulusDegree, Int32Array.from(bitSizes))
    );

    // Set the PlainModulus to a prime of bitSize 20.
    this.encParams.setPlainModulus(this.seal.PlainModulus.Batching(polyModulusDegree, bitSize));

    // Create a new Context
    this.context = this.seal.Context(
      this.encParams, // Encryption Parameters
      true, // ExpandModChain
      securityLevel // Enforce a security level
    );

    if (!this.context.parametersSet()) {
      throw new Error(
        'Could not set the parameters in the given context. Please try different encryption parameters.'
      );
    }

    this._initialized = true;
  }

  get initialized() {
    return this._initialized;
  }

  generateKeys() {
    if (!this._initialized || !this.seal || !this.context) {
      throw new Error('Cannot generate keys before initializing.');
    }

    // Create a new KeyGenerator (creates a new keypair internally)
    this.keyGenerator = this.seal.KeyGenerator(this.context);
    const secretKey = this.keyGenerator.secretKey();
    const publicKey = this.keyGenerator.createPublicKey();
    this.encoder = this.seal.BatchEncoder(this.context);
    this.encryptor = this.seal.Encryptor(this.context, publicKey);
    this.decryptor = this.seal.Decryptor(this.context, secretKey);
    this.evaluator = this.seal.Evaluator(this.context);
  }

  encode(data: BatchEncoderTypes) {
    if (!this.encoder) {
      throw new Error('Cannot encode before initializing.');
    }
    return this.encoder.encode(data);
  }

  decode(decryptedPlainText: PlainText) {
    if (!this.encoder) {
      throw new Error('Cannot decode before initializing.');
    }
    return this.encoder.decode(decryptedPlainText);
  }

  encrypt(plainText: PlainText) {
    if (!this.encryptor) {
      throw new Error('Cannot encrypt before initializing.');
    }
    return this.encryptor.encrypt(plainText);
  }

  decrypt(cipherText: CipherText) {
    if (!this.decryptor) {
      throw new Error('Cannot decrypt before initializing.');
    }
    return this.decryptor.decrypt(cipherText);
  }

  TEMP_evaluate(cipherText: CipherText) {
    if (!this.evaluator) {
      throw new Error('Cannot evaluate before initializing.');
    }
    return this.evaluator.add(cipherText, cipherText, cipherText);
  }
}