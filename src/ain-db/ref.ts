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

  constructor(ain: Ain, path?: string) {
    this.path = path && path.endsWith('/') ? path.substr(0, path.length-1) : path;
    const pathArr = this.path ? this.path.split('/') : [];
    this.key = pathArr.length > 0 ? pathArr[pathArr.length-1] : null;
    this._ain = ain;
    this._isRootReference = !path;
    this._listeners = {};
    this._numberOfListeners = 0;
  }

  get numberOfListeners(): number {
    return this._numberOfListeners;
  }

  push(value?: any): PromiEvent<any> | Reference {
    if (value) {
      if (!this.path) { throw new Error(''); }
      return this.setValue({ value });
    }
    return new Reference(this._ain, this.path+"/"+PushId.generate());
  }

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

  deleteValue(transactionInput?: ValueOnlyTransactionInput): PromiEvent<boolean> {
    let txInput: ValueOnlyTransactionInput = transactionInput || {};
    txInput['value'] = null;
    return this._ain.sendTransaction(
        Reference.extendTransactionInputWithType(
            txInput,
            this.path || "",
            "SET_RULE"
        )
    );
  }

  /* TO BE ADDED
  setFunction(transactionInput: ValueOnlyTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInputWithType(
            transactionInput,
            this.path || "",
            "SET_FUNC"
        )
    );
  }
  */

  setOwner(transactionInput: ValueOnlyTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInputWithType(
            transactionInput,
            this.path || "",
            "SET_OWNER"
        )
    );
  }

  setRule(transactionInput: ValueOnlyTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInputWithType(
            transactionInput,
            this.path || "",
            "SET_RULE"
        )
    );
  }

  setValue(transactionInput: ValueOnlyTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInputWithType(
            transactionInput,
            this.path || "",
            "SET_VALUE"
        )
    );
  }

  incrementValue(transactionInput: ValueOnlyTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInputWithType(
            transactionInput,
            this.path || "",
            "INC_VALUE"
        )
    );
  }

  decrementValue(transactionInput: ValueOnlyTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInputWithType(
            transactionInput,
            this.path || "",
            "DEC_VALUE"
        )
    );
  }

  update(transactionInput: UpdatesTransactionInput): PromiEvent<any> {
    return this._ain.sendTransaction(
        Reference.extendTransactionInputWithType(
            transactionInput,
            this.path || "",
            "UPDATES"
        )
    );
  }

  static extendTransactionInputWithType(
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
