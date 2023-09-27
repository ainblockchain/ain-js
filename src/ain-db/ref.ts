import {
  SetOperation,
  GetOperation,
  ListenerMap,
  SetOperationType,
  GetOperationType,
  SetMultiOperation,
  TransactionInput,
  ValueOnlyTransactionInput,
  SetMultiTransactionInput,
  EvalRuleInput,
  EvalOwnerInput,
  MatchInput,
  GetOptions,
} from '../types';
import Ain from '../ain';
import { PushId } from './push-id';

/**
 * A class for referencing the states of the blockchain database.
 */
export default class Reference {
  public readonly path: string;
  public readonly key: string | null;
  private _isRootReference: boolean;
  private _listeners: ListenerMap;
  private _numberOfListeners: number;
  private _ain: Ain;
  private _isGlobal: boolean;

  /**
   * Creates a new Reference object.
   * @param {Ain} ain The Ain object.
   * @param {string} path The path to refer to in the global state tree.
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

  /**
   * Sets the global path flag.
   * @param {boolean} isGlobal
   */
  setIsGlobal(isGlobal: boolean) {
    this._isGlobal = isGlobal;
  }

  /**
   * Getter for the number of listeners.
   * @returns {number} The number of listeners.
   */
  get numberOfListeners(): number {
    return this._numberOfListeners;
  }

  /**
   * Pushes a new child state to the current path of the blockchain states and
   * returns the reference of the child state.
   * If a value is given, it's set as the value of the newly added child
   * by sending a transaction to the network. Otherwise, it creates a key locally
   * for a new child but doesn't change any blockchain states.
   * @param {any} value The value of the newly added child state.
   * @returns {Promise<any> | Reference} The reference of the newly added child state.
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
   * Fetches the value of a blockchain state path.
   * @param {string} path The path of the blockchain state.
   * @param {GetOperation} options The get options.
   * @returns {Promise<any>} The value of the blockchain state.
   */
  getValue(path?: string, options?: GetOptions): Promise<any> {
    const req = Reference.buildGetRequest('GET_VALUE', Reference.extendPath(this.path, path), options);
    return this._ain.provider.send('ain_get', req);
  }

  /**
   * Fetches the rule configuration of a blockchain state path.
   * @param {string} path The path of the blockchain state.
   * @param {GetOperation} options The get options.
   * @returns {Promise<any>} The rule configuration the blockchain state.
   */
  getRule(path?: string, options?: GetOptions): Promise<any> {
    const req = Reference.buildGetRequest('GET_RULE', Reference.extendPath(this.path, path), options);
    return this._ain.provider.send('ain_get', req);
  }

  /**
   * Fetches the owner configuration of a blockchain state path.
   * @param {string} path The path of the blockchain state.
   * @param {GetOperation} options The get options.
   * @returns {Promise<any>} The owner configuration of the blockchain state.
   */
  getOwner(path?: string, options?: GetOptions): Promise<any> {
    const req = Reference.buildGetRequest('GET_OWNER', Reference.extendPath(this.path, path), options);
    return this._ain.provider.send('ain_get', req);
  }

  /**
   * Fetches the function configuration of a blockchain state path.
   * @param {string} path The path of the blockchain state.
   * @param {GetOperation} options The get options.
   * @returns {Promise<any>} The function configuration of the blockchain state.
   */
  getFunction(path?: string, options?: GetOptions): Promise<any> {
    const req = Reference.buildGetRequest('GET_FUNCTION', Reference.extendPath(this.path, path), options);
    return this._ain.provider.send('ain_get', req);
  }

  /**
   * Performs multiple get operations for values, rules, owners, or functions.
   * @param {Array<GetOperation>} gets The get operations.
   * @returns {Promise<any>} The results of the get operations.
   */
  get(gets: GetOperation[]): Promise<any> {
    const request = { type: 'GET', op_list: gets };
    for (let i = 0; i < gets.length; i++) {
      request.op_list[i].ref = Reference.extendPath(this.path, gets[i].ref);
    }
    return this._ain.provider.send('ain_get', request);
  }

  /**
   * Deletes a value from the blockchain states.
   * @param {ValueOnlyTransactionInput} transactionInput The transaction input object.
   * Any value given will be overwritten with null.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  deleteValue(transactionInput?: ValueOnlyTransactionInput, isDryrun: boolean = false): Promise<any> {
    let txInput: ValueOnlyTransactionInput = transactionInput || {};
    txInput['value'] = null;
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            txInput,
            Reference.extendPath(this.path, txInput.ref),
            "SET_VALUE",
            this._isGlobal
        ),
        isDryrun
    );
  }

  /**
   * Sets a function configuration in the blockchain states.
   * @param transactionInput The transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  setFunction(transactionInput: ValueOnlyTransactionInput, isDryrun: boolean = false): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            transactionInput,
            Reference.extendPath(this.path, transactionInput.ref),
            "SET_FUNCTION",
            this._isGlobal
        ),
        isDryrun
    );
  }

  /**
   * Sets a owner configuration in the blockchain states.
   * @param transactionInput The transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  setOwner(transactionInput: ValueOnlyTransactionInput, isDryrun: boolean = false): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            transactionInput,
            Reference.extendPath(this.path, transactionInput.ref),
            "SET_OWNER",
            this._isGlobal
        ),
        isDryrun
    );
  }

  /**
   * Sets a rule configuration in the blockchain states.
   * @param transactionInput The transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  setRule(transactionInput: ValueOnlyTransactionInput, isDryrun: boolean = false): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            transactionInput,
            Reference.extendPath(this.path, transactionInput.ref),
            "SET_RULE",
            this._isGlobal
        ),
        isDryrun
    );
  }

  /**
   * Sets a value in the blockchain states.
   * @param transactionInput The transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  setValue(transactionInput: ValueOnlyTransactionInput, isDryrun: boolean = false): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            transactionInput,
            Reference.extendPath(this.path, transactionInput.ref),
            "SET_VALUE",
            this._isGlobal
        ),
        isDryrun
    );
  }

  /**
   * Increments a value in the blockchain states.
   * @param transactionInput The transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  incrementValue(transactionInput: ValueOnlyTransactionInput, isDryrun: boolean = false): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            transactionInput,
            Reference.extendPath(this.path, transactionInput.ref),
            "INC_VALUE",
            this._isGlobal
        ),
        isDryrun
    );
  }

  /**
   * Decrements a value in the blockchain states.
   * @param transactionInput The transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  decrementValue(transactionInput: ValueOnlyTransactionInput, isDryrun: boolean = false): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetTransactionInput(
            transactionInput,
            Reference.extendPath(this.path, transactionInput.ref),
            "DEC_VALUE",
            this._isGlobal
        ),
        isDryrun
    );
  }

  /**
   * Sends a transaction of multi-set (SET) operation to the network.
   * @param transactionInput The multi-set (SET) transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  set(transactionInput: SetMultiTransactionInput, isDryrun: boolean = false): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendSetMultiTransactionInput(transactionInput, this.path), isDryrun);
  }

  /**
   * Requests an eval-rule (EVAL_RULE) operation to the network.
   * If it returns true, it means that the input operation satisfies the write rule
   * in the blockchain states.
   * @param transactionInput The multi-set (SET) transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  evalRule(params: EvalRuleInput): Promise<any> {
    const address = this._ain.signer.getAddress(params.address);
    const request = {
      address,
      ref: Reference.extendPath(this.path, params.ref),
      value: params.value,
      timestamp: params.timestamp
    }
    return this._ain.provider.send('ain_evalRule', request);
  }

  /**
   * Requests an eval-owner (EVAL_OWNER) operation to the network.
   * If it returns true, it means that the input operation satisfies the owner permissions
   * in the blockchain states.
   * @param transactionInput The multi-set (SET) transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  evalOwner(params: EvalOwnerInput): Promise<any> {
    const request = {
      address: this._ain.signer.getAddress(params.address),
      ref: Reference.extendPath(this.path, params.ref),
      permission: params.permission
    };
    return this._ain.provider.send('ain_evalOwner', request);
  }

  /**
   * Fetches the function configurations matched to the input reference (blockchain state path).
   * @param {MatchInput} params The match input object.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  matchFunction(params?: MatchInput): Promise<any> {
    const request = {
      ref: Reference.extendPath(this.path, params ? params.ref : undefined)
    }
    return this._ain.provider.send('ain_matchFunction', request);
  }

  /**
   * Fetches the rule configurations matched to the input reference (blockchain state path).
   * @param {MatchInput} params The match input object.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  matchRule(params?: MatchInput): Promise<any> {
    const request = {
      ref: Reference.extendPath(this.path, params ? params.ref : undefined)
    }
    return this._ain.provider.send('ain_matchRule', request);
  }

  /**
   * Fetches the owner configurations matched to the input reference (blockchain state path).
   * @param {MatchInput} params The match input object.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  matchOwner(params?: MatchInput): Promise<any> {
    const request = {
      ref: Reference.extendPath(this.path, params ? params.ref : undefined)
    }
    return this._ain.provider.send('ain_matchOwner', request);
  }

  // TODO(liayoo): Add this function.
  ///**
  // * Attaches an listener for database events.
  // * @param {EventType} event - A type of event.
  // * @param {Function} callback function to be executed when an event occurs.
  // */
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

  // TODO(liayoo): Add this function.
  ///**
  // * Removes a database event listener.
  // * @param {EventType} event - A type of event.
  // * @param {Function} callback - A callback function to dettach from the event.
  // */
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
   * Builds a get request.
   * @param {GetOperationType} type The get operations type.
   * @param {string} ref The blockchain state reference (path).
   * @param {GetOptions} options The get options.
   * @returns {any} The request built.
   */
  static buildGetRequest(type: GetOperationType, ref: string, options?: GetOptions): any {
    const request = { type, ref: Reference.sanitizeRef(ref) };
    if (options) {
      Object.assign(request, options);
    }
    return request;
  }

  /**
   * Extends a base path with an extension.
   * @param {string} basePath The base path.
   * @param {string} extension The extension.
   * @returns {string} The extended path.
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
   * Builds a transaction input object from a value-only transaction input object
   * and additional parameters.
   * @param {ValueOnlyTransactionInput} input The value-only transaction input object.
   * @param {string} ref The blockchain state reference (path).
   * @param {SetOperationType} type The set operation type.
   * @returns {TransactionInput} The transaction input built.
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
   * Builds a transaction input object from a multi-set (SET) transaction input object
   * and additional parameters.
   * @param {ValueOnlyTransactionInput} input The multi-set (SET) transaction input object.
   * @param {string} ref The blockchain state reference (path).
   * @param {SetOperationType} type The set operation type.
   * @returns {TransactionInput} The transaction input built.
   */
  static extendSetMultiTransactionInput(
      input: SetMultiTransactionInput,
      ref: string
  ): TransactionInput {
    const op_list: SetOperation[] = [];
    if (input.op_list) {
      input.op_list.forEach(op => {
        op_list.push(Object.assign(op, { ref: Reference.extendPath(ref, op.ref) }));
      });
    }
    delete input.op_list;
    const operation: SetMultiOperation = { type: 'SET', op_list };
    return Object.assign(input, { operation });
  }

  /**
   * Returns a sanitized blockchain state reference (path). It should have a slash at the
   * beginning and no slash at the end.
   * @param {string} ref The blockchain state reference (path).
   * @returns {string} The blockchain state reference sanitized.
   */
  static sanitizeRef(ref?: string): string {
    if (!ref) return '/';
    return '/' + ref.split('/').filter(key => key !== '').join('/');
  }
}
