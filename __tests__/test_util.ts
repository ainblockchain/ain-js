export declare function fail(error?: any): never;

export function eraseProtoVer(retVal) {
  retVal.protoVer = 'erased';
  return retVal;
}
