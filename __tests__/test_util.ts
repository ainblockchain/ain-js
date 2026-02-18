import { set } from 'lodash';

export function fail(error?: any): never {
  throw new Error(error || 'Test failed');
}

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

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};
