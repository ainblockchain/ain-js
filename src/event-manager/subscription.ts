import { EventEmitter } from 'events';
import { ErrorFirstCallback } from '../types';
import EventFilter from './event-filter';

export default class Subscription extends EventEmitter {
  private readonly _filter: EventFilter;

  constructor(filter: EventFilter) {
    super();
    this._filter = filter;
  }

  get filter(): EventFilter {
    return this._filter;
  }

  unsubscribe(callback: ErrorFirstCallback<boolean>) {
    // TODO(cshcomcom): Implement logic
    callback(new Error(`Not implemented!`));
  }
}
