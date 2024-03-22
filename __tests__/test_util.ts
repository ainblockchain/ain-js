import { set } from 'lodash';

export declare function fail(error?: any): never;

export function eraseProtoVer(result) {
  const erased = JSON.parse(JSON.stringify(result));
  set(erased, 'protoVer', 'erased');
  return erased;
}

export function eraseStateVersion(result) {
  const erased = JSON.parse(JSON.stringify(result));
  set(erased, '#version', 'erased');
  return erased;
}

