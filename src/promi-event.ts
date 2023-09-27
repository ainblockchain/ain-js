import * as EventEmitter from 'eventemitter3';

/**
 * A class that combines the Promise interface and the EventEmitter class.
 * @implements {Promise<T>}
 */
export class PromiEvent<T> implements Promise<T> {
  /** The event emitter. */
  public eventEmitter: EventEmitter;
  /** The promise. */
  public promise: Promise<T>
  /** The value for toString(). */
  public [Symbol.toStringTag];
  /** The resolve function. */
  private _resolve;
  /** The reject function. */
  private _reject;

  /**
   * Creates a new PromiEvent object.
   */
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    this.eventEmitter = new EventEmitter();
    Object.setPrototypeOf(this, PromiEvent.prototype);
    this[Symbol.toStringTag] = 'Promise';
  }

  /** The then method. */
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) =>
      TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) =>
      TResult2 | PromiseLike<TResult2>) | undefined | null
    ): Promise<TResult1 | TResult2> {
      return this.promise.then(onfulfilled, onrejected)
    }

  /** The catch method. */
  catch<TResult = never>(
    onrejected?: ((reason: any) =>
      TResult | PromiseLike<TResult>) | undefined | null
    ): Promise<T | TResult> {
      return this.promise.then(onrejected)
    }

  /** The finally method. */
  finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    return this.promise;
  }

  /** The resolve method. */
  resolve(val:T) { this._resolve(val) }
  /** The reject method. */
  reject(reason:any) { this._reject(reason) }

  /** The once method. */
  once(type: string, handler: (res: any) => void): PromiEvent<T> {
    this.eventEmitter.once(type, handler);
    return this;
  };

  /** The on method. */
  on(type: string, handler: (res: any) => void): PromiEvent<T> {
    this.eventEmitter.on(type, handler);
    return this;
  };
}
