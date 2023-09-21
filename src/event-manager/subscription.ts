import { EventEmitter } from 'events';
import EventFilter from './event-filter';

/**
 * A class for subscribing to blockchain events based on EventEmitter class.
 */
export default class Subscription extends EventEmitter {
  /** The event filter object. */
  private readonly _filter: EventFilter;

  /**
   * Creates a new Subscription object.
   * @param {EventFilter} filter The event filter object.
   */
  constructor(filter: EventFilter) {
    super();
    this._filter = filter;
  }

  /**
   * Getter for the event filter.
   */
  get filter(): EventFilter {
    return this._filter;
  }
}
