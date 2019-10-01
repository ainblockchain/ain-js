import Reference from './ref';
import Ain from '../ain';
import Provider from '../provider';

export default class Database {
  public provider: Provider;
  private _ain: Ain;

  constructor(ain: Ain, provider: Provider) {
    this.provider = provider;
    this._ain = ain;
  }

  ref(path?: string): Reference {
    return new Reference(this._ain, path);
  }
}
