import { PromiEvent } from '../promi-event';
import {
  SetOperation,
  GetOperation,
  EventType,
  ListenerMap,
  SetOperationType,
  GetOperationType,
  GetInputType,
  UpdateOperationType,
  SetUpdateOperation,
  TransactionInput,
  ValueOnlyTransactionInput,
  UpdatesTransactionInput
} from '../types';
import { test_value, test_rule, test_owner, test_func } from '../dummy-values';
import Ain from '../ain';
import { PushId } from './push-id';

export default class Reference {
  public readonly path?: string;
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
    this.path = path && path.endsWith('/') ? path.substr(0, path.length-1) : path;
    const pathArr = this.path ? this.path.split('/') : [];
    this.key = pathArr.length > 0 ? pathArr[pathArr.length-1] : null;
    this._ain = ain;
    this._isRootReference = !path;
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
   * @return {PromiEvent<any> | Reference} A reference instance of the given path.
   */
  push(value?: any): PromiEvent<any> | Reference {

    let ref = new Reference(this._ain, this.path+"/"+PushId.generate());
    if (value !== undefined) {
      return ref.setValue({ value });
    }
    return ref;
  }

  /**
   * Returns the value / write rule / owner rule / function hash at {this.path}.
   * @param {GetInputType | Array<GetInputType>} type - Type of data to get.
   * Could be any one from "VALUE", "RULE", "OWNER", "FUNC" or a combination of them as an array.
   * @return {Promise<any>}
   */
  get(type: GetInputType | Array<GetInputType>): Promise<any> {
    let operation: any = {};
    if (Array.isArray(type)) {
      operation.type = 'GET_BATCH';
      let ops: Array<any> = [];
      type.forEach(t => {
        ops.push({ ref: this.path || '', type: 'GET_' + t });
      })
      operation.batch_list = ops as GetOperation[];
    } else {
      operation.type = 'GET_' + type as GetOperationType;
      operation.ref = this.path || '';
    }
    return new Promise((resolve, reject) => {
      if (Array.isArray(type)) {
        let dataArr: Array<any> = []
        type.forEach(t => {
          dataArr.push(this.getTestData(t));
        })
        resolve(dataArr);
      } else {
        resolve(this.getTestData(type));
      }
    })
  }

  /**
   * Attaches an listener for database events.
   * @param {EventType} event - A type of event.
   * @param {Function} callback function to be executed when an event occurs.
   */
  on(event: EventType, callback: Function) {
    if (this._isRootReference) {
      throw new Error('[ain-js.Reference.on] Cannot attach an on() listener to a root node');
    }
    if (!this._listeners[event]) { this._listeners[event] = []; }
    this._listeners[event].push(callback);
    this._numberOfListeners++;
    setInterval(() => {
      if (!!this._listeners[event]) {
        this._listeners[event].forEach(cb => {
          cb(10);
        });
      }
    }, 1000);
  }

  /**
   * Removes a database event listener.
   * @param {EventType} event - A type of event.
   * @param {Function} callback - A callback function to dettach from the event.
   */
  off(event?: EventType, callback?: Function) {
    if (!event && !callback) {
      this._listeners = {};
      this._numberOfListeners = 0;
    } else if (!!event && !callback) {
      let len = this._listeners[event].length;
      this._listeners[event] = [];
      this._numberOfListeners = this._numberOfListeners - len;
    } else if (!!event && !!callback) {
      if (!!this._listeners[event]) {
        let index = this._listeners[event].indexOf(callback);
        if (index > -1) {
          this._listeners[event].splice(index, 1);
          this._numberOfListeners--;
        }
      }
    }
  }

  /**
   * Deletes a value at {this.path}
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * Any value given will be overwritten with null.
   * @return {PromiEvent<any>}
   */
  deleteValue(transactionInput?: ValueOnlyTransactionInput): PromiEvent<any> {
    let txInput: ValueOnlyTransactionInput = transactionInput || {};
    txInput['value'] = null;
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            txInput,
            this.path || "",
            "SET_RULE"
        )
    );
  }

  /* TODO (lia): add this method
  setFunction(transactionInput: ValueOnlyTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path || "",
            "SET_FUNC"
        )
    );
  }
  */

  /**
   * Sets the owner rule at {this.path}.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {PromiEvent<any>}
   */
  setOwner(transactionInput: ValueOnlyTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path || "",
            "SET_OWNER"
        )
    );
  }

  /**
   * Sets the write rule at {this.path}.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {PromiEvent<any>}
   */
  setRule(transactionInput: ValueOnlyTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path || "",
            "SET_RULE"
        )
    );
  }

  /**
   * Sets a value at {this.path}.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {PromiEvent<any>}
   */
  setValue(transactionInput: ValueOnlyTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path || "",
            "SET_VALUE"
        )
    );
  }

  /**
   * Increments the value at {this.path}.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {PromiEvent<any>}
   */
  incrementValue(transactionInput: ValueOnlyTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path || "",
            "INC_VALUE"
        )
    );
  }

  /**
   * Decrements the value at {this.path}.
   * @param {ValueOnlyTransactionInput} transactionInput - A transaction input object.
   * @return {PromiEvent<any>}
   */
  decrementValue(transactionInput: ValueOnlyTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path || "",
            "DEC_VALUE"
        )
    );
  }

  /**
   * Processes multiple set operations.
   * @param {UpdatesTransactionInput} transactionInput - A transaction input object.
   * @return {PromiEvent<any>}
   */
  update(transactionInput: UpdatesTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInput(
            transactionInput,
            this.path || "",
            "UPDATES"
        )
    );
  }

  /**
   * Decorates a transaction input with an appropriate type and update_list or ref and value.
   * @param {ValueOnlyTransactionInput | UpdatesTransactionInput} input - A transaction input object
   * @param {string} ref - The path at which set operations will take place
   * @param {SetOperationType | UpdateOperationType} type - A type of set operations
   * @return {TransactionInput}
   */
  static extendTransactionInput(
      input: ValueOnlyTransactionInput | UpdatesTransactionInput,
      ref: string,
      type: SetOperationType | UpdateOperationType
  ): TransactionInput {
    if (input['update_list']) {
      const operation: SetUpdateOperation = {
          type: type as UpdateOperationType,
          update_list: (input as UpdatesTransactionInput).update_list
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

  // For testing/dev purposes only
  // TODO (lia): remove this function after integrating with AIN
  private getTestData(type) {
    switch (type) {
      case 'VALUE':
        return test_value;
      case 'RULE':
        return test_rule;
      case 'OWNER':
        return test_owner;
      case 'FUNC':
        return test_func;
    }
  }
}
