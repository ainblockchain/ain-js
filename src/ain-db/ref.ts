import {
  SetOperation,
  GetOperation,
  ListenerMap,
  SetOperationType,
  GetOperationType,
  SetMultiOperationType,
  SetMultiOperation,
  TransactionInput,
  ValueOnlyTransactionInput,
  SetMultiTransactionInput,
  EvalRuleInput,
  EvalOwnerInput,
  MatchInput
} from '../types';
import Ain from '../ain';
import { PushId } from './push-id';

export default class Reference {
  public readonly path: string;
  public readonly key: string | null;
  private _isRootReference: boolean;
  private _listeners: ListenerMap;
  private _numberOfListeners: number;
  private _ain: Ain;
  private _isGlobal: boolean;

  /**
   * @param {Ain} ain An ain instance.
   * @param {String} path The path in the global state tree.
   * @constructor
   */
  constructor(ain: Ain, path?: string) {
    this.path = Reference.sanitizeRef(path);
    const pathArr = this.path ? this.path.split('/') : [];
    this.key = pathArr.length > 0 ? pathArr[pathArr.length-1] : null;
    this._ain = ain;
    this._isRootReference = this.path === '/';
    this._listeners = {};
    this._numberOfListeners = 0;
    this._isGlobal = false;
  }

  setIsGlobal(isGlobal: boolean) {
    this._isGlobal = isGlobal;
  }

  /**
   * A getter for number of listeners.
   * @return {number} The number of listeners.
   */
  get numberOfListeners(): number {
    return this._numberOfListeners;
  }

  /**
   * If value is given, it sets the value at a new child of this.path;
   * otherwise, it creates a key for a new child but doesn't set any values.
   * @param {any} value - A value to set at the path.
   * @return {Promise<any> | Reference} A reference instance of the given path.
   */
  push(value?: any): Promise<any> | Reference {
    const newKey = "/" + PushId.generate();
    let ref = new Reference(this._ain, Reference.extendPath(this.path, newKey));
    if (value !== undefined) {
      return ref.setValue({ value });
    }
    return ref;
  }

  /**
   * Returns the value at the path.
   * @param path
   */
  getValue(path?: string): Promise<any> {
    const req = Reference.buildGetRequest('GET_VALUE', Reference.extendPath(this.path, path));
    return this._ain.provider.send('ain_get', req);
  }

  /**
   * Returns the rule at the path.
   * @param path
   */
  getRule(path?: string): Promise<any> {
    const req = Reference.buildGetRequest('GET_RULE', Reference.extendPath(this.path, path));
    return this._ain.provider.send('ain_get', req);
  }

  /**
   * Returns the owner config at the path.
   * @param path
   */
  getOwner(path?: string): Promise<any> {
    const req = Reference.buildGetRequest('GET_OWNER', Reference.extendPath(this.path, path));
    return this._ain.provider.send('ain_get', req);
  }

  /**
   * Returns the function config at the path.
   * @param path
   */
  getFunction(path?: string): Promise<any> {
    const req = Reference.buildGetRequest('GET_FUNCTION', Reference.extendPath(this.path, path));
    return this._ain.provider.send('ain_get', req);
  }

  /**
   * Returns the value / write rule / owner rule / function hash at multiple paths.
   * @param {Array<GetOperation>} requests - Array of get requests
   * Could be any one from "VALUE", "RULE", "OWNER", "FUNC" or a combination of them as an array.
   * @return {Promise<any>}
   */
  get(gets: GetOperation[]): Promise<any> {
    let request = { type: 'GET', op_list: gets }
    for (let i = 0; i < gets.length; i++) {
      request.op_list[i].ref = Reference.extendPath(this.path, gets[i].ref);
    }
    return this._ain.provider.send('ain_get', request);
  }

  /**
   * Deletes a value.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * Any value given will be overwritten with null.
   * @return {Promise<any>}
   */
  deleteValue(transactionInput?: ValueOnlyTransactionInput): Promise<any> {
    let txInput: ValueOnlyTransactionInput = transactionInput || {};
    txInput['value'] = null;
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            txInput,
            Reference.extendPath(this.path, txInput.ref),
            "SET_VALUE",
            this._isGlobal
        )
    );
  }

  /**
   * Sets a function config.
   * @param transactionInput
   */
  setFunction(transactionInput: ValueOnlyTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            transactionInput,
            Reference.extendPath(this.path, transactionInput.ref),
            "SET_FUNCTION",
            this._isGlobal
        )
    );
  }

  /**
   * Sets the owner rule.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {Promise<any>}
   */
  setOwner(transactionInput: ValueOnlyTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            transactionInput,
            Reference.extendPath(this.path, transactionInput.ref),
            "SET_OWNER",
            this._isGlobal
        )
    );
  }

  /**
   * Sets the write rule.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {Promise<any>}
   */
  setRule(transactionInput: ValueOnlyTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            transactionInput,
            Reference.extendPath(this.path, transactionInput.ref),
            "SET_RULE",
            this._isGlobal
        )
    );
  }

  /**
   * Sets a value.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {Promise<any>}
   */
  setValue(transactionInput: ValueOnlyTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            transactionInput,
            Reference.extendPath(this.path, transactionInput.ref),
            "SET_VALUE",
            this._isGlobal
        )
    );
  }

  /**
   * Increments the value.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {Promise<any>}
   */
  incrementValue(transactionInput: ValueOnlyTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            transactionInput,
            Reference.extendPath(this.path, transactionInput.ref),
            "INC_VALUE",
            this._isGlobal
        )
    );
  }

  /**
   * Decrements the value.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {Promise<any>}
   */
  decrementValue(transactionInput: ValueOnlyTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            transactionInput,
            Reference.extendPath(this.path, transactionInput.ref),
            "DEC_VALUE",
            this._isGlobal
        )
    );
  }

  /**
   * Processes multiple set operations.
   * @param {SetMultiTransactionInput} transactionInput - A transaction input object.
   * @return {Promise<any>}
   */
  set(transactionInput: SetMultiTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetMultiTransactionInput(transactionInput, this.path));
  }

  /**
   * Returns the rule evaluation result. True if the params satisfy the write rule,
   * false if not.
   * @param params
   */
  evalRule(params: EvalRuleInput): Promise<boolean> {
    const address = this._ain.wallet.getImpliedAddress(params.address);
    const request = {
      address,
      ref: Reference.extendPath(this.path, params.ref),
      value: params.value,
      timestamp: params.timestamp
    }
    return this._ain.provider.send('ain_evalRule', request);
  }

  /**
   * Returns the owner evaluation result.
   * @param params
   */
  evalOwner(params: EvalOwnerInput): Promise<any> {
    const request = {
      address: this._ain.wallet.getImpliedAddress(params.address),
      ref: Reference.extendPath(this.path, params.ref),
      permission: params.permission
    };
    return this._ain.provider.send('ain_evalOwner', request);
  }

  /**
   * Returns the function configs that are related to the input ref.
   * @param params
   */
  matchFunction(params?: MatchInput): Promise<any> {
    const request = {
      ref: Reference.extendPath(this.path, params ? params.ref : undefined)
    }
    return this._ain.provider.send('ain_matchFunction', request);
  }

  /**
   * Returns the rule configs that are related to the input ref.
   * @param params
   */
  matchRule(params?: MatchInput): Promise<any> {
    const request = {
      ref: Reference.extendPath(this.path, params ? params.ref : undefined)
    }
    return this._ain.provider.send('ain_matchRule', request);
  }

  /**
   * Returns the owner configs that are related to the input ref.
   * @param params
   */
  matchOwner(params?: MatchInput): Promise<any> {
    const request = {
      ref: Reference.extendPath(this.path, params ? params.ref : undefined)
    }
    return this._ain.provider.send('ain_matchOwner', request);
  }

  /**
   * TODO (lia): Add this function
   * Attaches an listener for database events.
   * @param {EventType} event - A type of event.
   * @param {Function} callback function to be executed when an event occurs.
   */
  // on(event: EventType, callback: Function) {
  //   if (this._isRootReference) {
  //     throw new Error('[ain-js.Reference.on] Cannot attach an on() listener to a root node');
  //   }
  //   if (!this._listeners[event]) { this._listeners[event] = []; }
  //   this._listeners[event].push(callback);
  //   this._numberOfListeners++;
  //   let count = 0;
  //   const interval = setInterval(() => {
  //     if (count >= 3) clearInterval(interval);
  //     if (!!this._listeners[event]) {
  //       this._listeners[event].forEach(cb => {
  //         cb(10);
  //       });
  //     }
  //     count++;
  //   }, 1000);
  // }

  /**
   * TODO (lia): Add this function
   * Removes a database event listener.
   * @param {EventType} event - A type of event.
   * @param {Function} callback - A callback function to dettach from the event.
   */
  // off(event?: EventType, callback?: Function) {
  //   if (!event && !callback) {
  //     this._listeners = {};
  //     this._numberOfListeners = 0;
  //   } else if (!!event && !callback) {
  //     let len = this._listeners[event].length;
  //     this._listeners[event] = [];
  //     this._numberOfListeners = this._numberOfListeners - len;
  //   } else if (!!event && !!callback) {
  //     if (!!this._listeners[event]) {
  //       let index = this._listeners[event].indexOf(callback);
  //       if (index > -1) {
  //         this._listeners[event].splice(index, 1);
  //         this._numberOfListeners--;
  //       }
  //     }
  //   }
  // }

  /**
   * Returns a get request
   * @param type
   * @param ref
   */
  static buildGetRequest(type: GetOperationType, ref: string) {
    return { type, ref: Reference.sanitizeRef(ref) };
  }

  /**
   * Returns a path that is the basePath extended with extension.
   * @param basePath
   * @param extension
   */
  static extendPath(basePath?: string, extension?: string): string {
    const sanitizedBase = Reference.sanitizeRef(basePath);
    const sanitizedExt = Reference.sanitizeRef(extension);
    if (sanitizedBase === '/') {
      return sanitizedExt;
    }
    if (sanitizedExt === '/') {
      return sanitizedBase;
    }
    return sanitizedBase + sanitizedExt;
  }

  /**
   * Decorates a transaction input with an appropriate type, ref and value.
   * @param {ValueOnlyTransactionInput} input - A transaction input object
   * @param {string} ref - The path at which set operations will take place
   * @param {SetOperationType} type - A type of set operations
   * @return {TransactionInput}
   */
  static extendSetTransactionInput(
      input: ValueOnlyTransactionInput,
      ref: string,
      type: SetOperationType,
      isGlobal: boolean
  ): TransactionInput {
    const operation: SetOperation = {
      type,
      ref,
      value: input.value,
      is_global: input.is_global !== undefined ? input.is_global : isGlobal
    };
    delete input.value;
    delete input.is_global;
    return Object.assign(input, { operation });
  }

  /**
   * Decorates a transaction input with an appropriate type and op_list.
   * @param {SetMultiTransactionInput} input - A transaction input object
   * @param {string} ref - The path at which set operations will take place
   * @param {SetMultiOperationType} type - A type of set operations
   * @return {TransactionInput}
   */
  static extendSetMultiTransactionInput(
      input: SetMultiTransactionInput,
      ref: string
  ): TransactionInput {
    const op_list: SetOperation[] = [];
    input.op_list.forEach(op => {
      op_list.push(Object.assign(op, { ref: Reference.extendPath(ref, op.ref) }));
    });
    delete input.op_list;
    const operation: SetMultiOperation = { type: 'SET', op_list };
    return Object.assign(input, { operation });
  }

  /**
   * Returns a sanitized ref. If should have a slash at the
   * beginning and no slash at the end.
   * @param ref
   */
  static sanitizeRef(ref?: string): string {
    if (!ref) return '/';
    return '/' + ref.split('/').filter(key => key !== '').join('/');
  }
}
