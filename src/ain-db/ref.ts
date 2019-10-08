// import { PromiEvent } from '../promi-event';
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
  SetMultiTransactionInput
} from '../types';
import { test_value, test_rule, test_owner, test_func } from '../dummy-values';
import Ain from '../ain';
import { PushId } from './push-id';

export default class Reference {
  public readonly path: string;
  public readonly key: string | null;
  private _isRootReference: boolean;
  private _listeners: ListenerMap;
  private _numberOfListeners: number;
  private _ain: Ain;

  /**
   * @param {Ain} ain
   * @param {String} path
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
    let ref = new Reference(this._ain, this.path + "/" + PushId.generate());
    if (value !== undefined) {
      return ref.setValue({ value });
    }
    return ref;
  }

  getValue(): Promise<any> {
    let req = Reference.buildGetRequest('GET_VALUE', this.path);
    return new Promise((resolve, reject) => {
      resolve(this.getTestData('GET_VALUE'));
    })
  }

  getRule(): Promise<any> {
    let req = Reference.buildGetRequest('GET_RULE', this.path);
    return new Promise((resolve, reject) => {
      resolve(this.getTestData('GET_RULE'));
    })
  }

  getOwner(): Promise<any> {
    let req = Reference.buildGetRequest('GET_OWNER', this.path);
    return new Promise((resolve, reject) => {
      resolve(this.getTestData('GET_OWNER'));
    })
  }

 /* TODO (lia): add this method
  getFunction(): Promise<any> {

  }
  */

  /**
   * Returns the value / write rule / owner rule / function hash at multiple paths.
   * @param {Array<GetOperation>} requests - Array of get requests
   * Could be any one from "VALUE", "RULE", "OWNER", "FUNC" or a combination of them as an array.
   * @return {Promise<any>}
   */
  get(gets: GetOperation[]): Promise<any> {
    let request = {
      operation: {
        type: 'GET',
        get_list: gets
      }
    }
    for (let i = 0; i < gets.length; i++) {
      let sanitized = Reference.sanitizeRef(gets[i].ref);
      request.operation.get_list[i].ref = this.path + sanitized;
    }
    return new Promise((resolve, reject) => {
      let dataArr: Array<any> = []
      gets.forEach(get => {
        dataArr.push(this.getTestData(get.type));
      })
      resolve(dataArr);
    })
  }

  /**
   * Deletes a value at {this.path}
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * Any value given will be overwritten with null.
   * @return {Promise<any>}
   */
  deleteValue(transactionInput?: ValueOnlyTransactionInput): Promise<any> {
    let txInput: ValueOnlyTransactionInput = transactionInput || {};
    txInput['value'] = null;
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            txInput,
            this.path,
            "SET_RULE"
        )
    );
  }

  /* TODO (lia): add this method
  setFunction(transactionInput: ValueOnlyTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path,
            "SET_FUNC"
        )
    );
  }
  */

  /**
   * Sets the owner rule at {this.path}.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {Promise<any>}
   */
  setOwner(transactionInput: ValueOnlyTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path,
            "SET_OWNER"
        )
    );
  }

  /**
   * Sets the write rule at {this.path}.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {Promise<any>}
   */
  setRule(transactionInput: ValueOnlyTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path,
            "SET_RULE"
        )
    );
  }

  /**
   * Sets a value at {this.path}.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {Promise<any>}
   */
  setValue(transactionInput: ValueOnlyTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path,
            "SET_VALUE"
        )
    );
  }

  /**
   * Increments the value at {this.path}.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {Promise<any>}
   */
  incrementValue(transactionInput: ValueOnlyTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path,
            "INC_VALUE"
        )
    );
  }

  /**
   * Decrements the value at {this.path}.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {Promise<any>}
   */
  decrementValue(transactionInput: ValueOnlyTransactionInput): Promise<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path,
            "DEC_VALUE"
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
        Reference.extendTransactionInput(
            transactionInput,
            this.path,
            "SET"
        )
    );
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

  static buildGetRequest(type: GetOperationType, ref: string) {
    return {
        operation: {
          type,
          ref
        }
      };
  }

  /**
   * Decorates a transaction input with an appropriate type and set_list or ref and value.
   * @param {ValueOnlyTransactionInput | SetMultiTransactionInput} input - A transaction input object
   * @param {string} ref - The path at which set operations will take place
   * @param {SetOperationType | SetMultiOperationType} type - A type of set operations
   * @return {TransactionInput}
   */
  static extendTransactionInput(
      input: ValueOnlyTransactionInput | SetMultiTransactionInput,
      ref: string,
      type: SetOperationType | SetMultiOperationType
  ): TransactionInput {
    if (input['set_list']) {
      const operation: SetMultiOperation = {
          type: type as SetMultiOperationType,
          set_list: (input as SetMultiTransactionInput).set_list
        };
      return Object.assign(input, { operation });
    } else {
      const operation: SetOperation = {
          type: type as SetOperationType,
          ref,
          value: (input as ValueOnlyTransactionInput).value
        };
      return Object.assign(input, { operation });
    }
  }

  static sanitizeRef(ref?: string): string {
    if (!ref) return '/';
    let sanitized = ref;
    if (sanitized.endsWith('/')) sanitized = sanitized.substr(0, sanitized.length-1);
    if (!sanitized.startsWith('/')) sanitized = '/' + sanitized;
    return sanitized;
  }

  // For testing/dev purposes only
  // TODO (lia): remove this function after integrating with AIN
  private getTestData(type) {
    switch (type) {
      case 'GET_VALUE':
        return test_value;
      case 'GET_RULE':
        return test_rule;
      case 'GET_OWNER':
        return test_owner;
      case 'GET_FUNC':
        return test_func;
    }
  }
}
