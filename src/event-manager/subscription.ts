import { EventEmitter } from 'events';
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
}
