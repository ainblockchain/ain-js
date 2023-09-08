import * as EventEmitter from 'eventemitter3';

/**
 * A combination of a promise and an event emitter.
 * @implements {Promise<T>}
 */
export class PromiEvent<T> implements Promise<T> {
  public eventEmitter: EventEmitter;
  public promise: Promise<T>
  public [Symbol.toStringTag];
  private _resolve;
  private _reject;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    this.eventEmitter = new EventEmitter();
    Object.setPrototypeOf(this, PromiEvent.prototype);
    this[Symbol.toStringTag] = 'Promise';
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) =>
      TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) =>
      TResult2 | PromiseLike<TResult2>) | undefined | null
    ): Promise<TResult1 | TResult2> {
      return this.promise.then(onfulfilled, onrejected)
    }

  catch<TResult = never>(
    onrejected?: ((reason: any) =>
      TResult | PromiseLike<TResult>) | undefined | null
    ): Promise<T | TResult> {
      return this.promise.then(onrejected)
    }

  finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    return this.promise;
  }

  resolve(val:T) { this._resolve(val) }
  reject(reason:any) { this._reject(reason) }

  once(type: string, handler: (res: any) => void): PromiEvent<T> {
    this.eventEmitter.once(type, handler);
    return this;
  };

  on(type: string, handler: (res: any) => void): PromiEvent<T> {
    this.eventEmitter.on(type, handler);
    return this;
  };
}
