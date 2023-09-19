import Reference from './ref';
import Ain from '../ain';
import Provider from '../provider';

/**
 * A class for managing blockchain database states.
 */
export default class Database {
  /** The network provider object. */
  public provider: Provider;
  /** The Ain object. */
  private _ain: Ain;

  /**
   * Creates a new Database object.
   * @param {Ain} ain The Ain object.
   * @param {Provider} provider The network provider object.
   */
  constructor(ain: Ain, provider: Provider) {
    this.provider = provider;
    this._ain = ain;
  }

  /**
   * Returns a reference instance of the given path.
   * @param {String} path The path to refer to.
   * @return {Reference} A reference instance of the given path.
   */
  ref(path?: string): Reference {
    return new Reference(this._ain, path);
  }
}
