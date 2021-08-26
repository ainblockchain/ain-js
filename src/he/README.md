# Homomorphic Encryption

ain-js supports basic Homomorphic Encryption (HE) functionalities that can be used in various applications. 

## APIs

### init(keys?: HomomorphicEncryptionSecretKey | null, params?: HomomorphicEncryptionParams | null): Promise<void>
Creates a new instance of DesiloSeal, initializing the encryption parameters and the context. It can initialize with existing keys and/or custom encryption parameters. If the `keys` argument is not provided, a new set of keys will be generated. If the `params` is not provided, the default params will be used.
Default params:
```ts
const DEFAULT_PARAMS: HomomorphicEncryptionParams = {
  polyModulusDegree: 8192,
  coeffModulusArray: Int32Array.from([60, 40, 40, 60]),
  scaleBit: 40
}
```

### encrypt(array: Float64Array): CipherText
Takes a Float64Array as input and encodes and encrypts it.

### decrypt(cipherText: string): Float64Array
Takes a CipherText string as input and decrypts and decodes it.

### TEST_evaluate_double(cipherText: CipherText): CipherText
This is a function developed for testing purposes. It takes a CipherText as input, doubles it, performing a homomorphic calculation, and returns the result.

### TEST_getKeys(): HomomorphicEncryptionSecretKey
This is a function developed for testing purposes. It returns the secret key currently in use. 

## Usage
```ts
const ain = new Ain('http://node.ainetwork.ai:8080');
await ain.he.init();
const TEST_DATA = Float64Array.from({ length: ain.he.seal.encoder.slotCount }).map((x, i) => i);
const cipherText = ain.he.encrypt(TEST_DATA);
// cipherText updated
ain.he.TEST_evaluate_double(cipherText);
// .save() returns a base64 string representation of the cipher
const decrypted = ain.he.decrypt(cipherText.save());
```
