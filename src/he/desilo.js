/**
 * This file is copied from https://git.desilo.kr/nipa/comcom/-/blob/master/src/desilo.js
 */

const SEAL = require('node-seal');

/**
 * wrapper Error class for DesiloSeal
 */
class DesiloSealError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * node-seal wrapper class
 */
class DesiloSeal {

  /**
   * Constructor
   * @param {Number} polyModulusDegree
   * @param {Int32Array} coeffModulusArray
   * @param {Number} scaleBits
   */
  constructor(polyModulusDegree, coeffModulusArray, scaleBits) {
    this.polyModulusDegree = polyModulusDegree;
    this.coeffModulusArray = coeffModulusArray;
    this.scale = Math.pow(2, scaleBits);
  }

  /**
   * Initializes new SEALContext
   */
  async initContext() {
    this.seal = await SEAL();
    const securityLevel = this.seal.SecurityLevel.tc128;
    const parms = this.seal.EncryptionParameters(this.seal.SchemeType.ckks);

    const { polyModulusDegree, coeffModulusArray } = this;
    parms.setPolyModulusDegree(polyModulusDegree);

    const coeffObj = this.seal.CoeffModulus;
    const coeffModulus = coeffObj.Create(polyModulusDegree, coeffModulusArray);
    parms.setCoeffModulus(coeffModulus);

    this.context = this.seal.Context(parms, true, securityLevel);
    if (!this.context.parametersSet) {
      throw new DesiloSealError(`
          Could not set the parameters in the given context.
          Please try different encryption parameters.`);
    }

    this.encoder = this.seal.CKKSEncoder(this.context);
  }

  /**
   * Makes a new keyset
   * @param {string} secretKeyStr - secret key to load
   * @param {string} publicKeyStr - public key to load
   */
  initKeySet() {
    const keyGenerator = this.seal.KeyGenerator(this.context);
    const publicKey = keyGenerator.createPublicKey();
    const secretKey = keyGenerator.secretKey();
    const relinKeys = keyGenerator.createRelinKeys();

    this.keys = {
      publicKey,
      secretKey,
      // galoisKeys: keyGenerator.createGaloisKeys(),
      relinKeys,
    };
    this.newKeys = true;        
  }

  /**
   * Loads secret key
   * @param {string} secretKeyStr - secret key to load
   * @param {string} publicKeyStr - public key to load
   */
  loadKeySet(secretKeyStr, publicKeyStr = undefined) {
    const secretKey = this.seal.SecretKey();
    secretKey.load(this.context, secretKeyStr);
    const keyGenerator = this.seal.KeyGenerator(this.context, secretKey);
    let publicKey = undefined;
    if (publicKeyStr) {
      publicKey = this.seal.PublicKey();
      publicKey.load(this.context, publicKeyStr);
    } else {
      publicKey = keyGenerator.createPublicKey();
    }
    const relinKeys = keyGenerator.createRelinKeys();
    this.keys = {
      publicKey,
      secretKey,
      // galoisKeys: keyGenerator.createGaloisKeys(),
      relinKeys,
    };
    this.newKeys = false;
  }

  /**
   * Initialize encryptor, decryptor, evaluator
   */
  initClasses() {
    this.encryptor = this.seal.Encryptor(this.context, this.keys.publicKey);
    this.decryptor = this.seal.Decryptor(this.context, this.keys.secretKey);
    this.evaluator = this.seal.Evaluator(this.context);
  }

  /**
   * gets entire keyset
     @returns {object} keys
    */
  getKeys() {
    // hidden for now, due to memory issue
    // const publicKey = this.keys.publicKey ? this.keys.publicKey.save() : '';
    // const relinKeys = this.keys.relinKeys ? this.keys.relinKeys.save() : '';
    // const galoisKeys = (this.keys.galoisKeys) ? this.keys.galoisKeys.save() : "";
    const secretKey = (this.keys.secretKey) ? this.keys.secretKey.save() : "";

    return {
      secretKey,
      // publicKey: publicKey,
      // galoisKeys,
      // relinKeys: relinKeys,
    };
  }

  /**
   * gets secretKey
   * @returns {seal.SecretKey} secretKey
   */
  getSecretKey() {
    const secretKey = this.keys.secretKey ? this.keys.secretKey.save() : '';
    return secretKey;
  }

  /**
   * encrypts a length-fixed array into a ciphertext
   * @param {Float64Array} - array of length poly_mod_degree / 2
   * @returns {CipherText}
   */
  encrypt(array) {
    const plaintext = this.encoder.encode(array, this.scale);
    try {
      return this.encryptor.encrypt(plaintext);
    } catch (e) {
      throw new DesiloSealError('Encryption failed for an encoded object');
    }
  }

  /**
   * Decrypt ciphertext
   * @param {string::Ciphertext} cipherStr - ciphertext string
   * @returns {Float64Array}
   */
  decrypt(cipherStr) {
    const uploadedCipherText = this.seal.CipherText();
    uploadedCipherText.load(this.context, cipherStr);
    const decryptedPlainText = this.decryptor.decrypt(uploadedCipherText);
    // TODO: data type
    return this.encoder.decode(decryptedPlainText);
  }
}

/**
 * Factory method for DesiloSeal class
 * @param {Object} keys - object containing sk, pk, galois-key, relin-key strings
 * @returns {DesiloSeal} seal - Desilo SEAL wrapper class
 */
async function DesiloSealFactory(keys, params) {
  const { polyModulusDegree, coeffModulusArray, scaleBit } = params;
  const seal = new DesiloSeal(polyModulusDegree, coeffModulusArray, scaleBit);
  await seal.initContext();

  if (keys) {
    if (keys.secretKey) {
      seal.loadKeySet(keys.secretKey);
    } else {
      // TODO: check key dict structure
      throw new DesiloSealError('key loading unsuccessful');
    }
  }

  if (!seal.keys) {
    seal.initKeySet();
  }
  seal.initClasses();
  return seal;
}

module.exports = {
    DesiloSealFactory
}
