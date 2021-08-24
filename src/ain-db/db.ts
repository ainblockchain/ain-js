import Reference from './ref';
import Ain from '../ain';
import Provider from '../provider';

export default class Database {
  public provider: Provider;
  private _ain: Ain;

  /**
   * @param {Ain} ain
   * @param {Provider} provider
   *
   * @constructor
   */
  constructor(ain: Ain, provider: Provider) {
    this.provider = provider;
    this._ain = ain;
  }

  /**
   * Returns a reference instance of the given path.
   * @param {String} path
   * @return {Reference} A reference instance of the given path.
   */
  ref(path?: string): Reference {
    return new Reference(this._ain, path);
  }
}
