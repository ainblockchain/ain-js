import EventManager from './index';

export default class EventCallbackManager {
  private _eventManager: EventManager;

  constructor(eventManager: EventManager) {
    this._eventManager = eventManager;
  }

  emitEvent(filterId: string, payload: any) {
    const targetEventEmitter = this._eventManager.getEventEmitter(filterId);
    if (!targetEventEmitter) {
      throw Error(`Can't find event emitter by filter id (${filterId})`);
    }
    targetEventEmitter.emit('data', payload);
  }

  emitError(filterId: string, errorMessage: string) {
    const targetEventEmitter = this._eventManager.getEventEmitter(filterId);
    if (!targetEventEmitter) {
      throw Error(`Can't find event emitter by filter id (${filterId})`);
    }
    targetEventEmitter.emit('error', errorMessage);
  }
}
