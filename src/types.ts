export interface Account {
  address: string,
  private_key: string,
  full_public_key: string
}

export interface Accounts {[address: string]: Account}

export interface KdfParams {
  dklen: number,
  salt: string,
  prf?: string,
  c?: number,
  n?: number,
  r?: number,
  p?: number
}

export interface V3KeystoreOptions {
  salt?: string,
  iv?: Buffer,
  kdf?: string,
  dklen?: number,
  c?: number,
  n?: number,
  r?: number,
  p?: number,
  prf?: string,
  cipher?: string,
  uuid?: Buffer
}

export interface V3Keystore {
  version: 3,
  id: string,
  address: string,
  crypto: {
    ciphertext: string,
    cipherparams: {
      iv: string
    },
    cipher: string,
    kdf: string,
    kdfparams: KdfParams,
    mac: string
  }
}

export type EventType = "value" | "child_added" | "child_changed" | "child_removed";

export type UpdateOperationType = "UPDATES";

export type BatchOperationType = "GET_BATCH";

export type SetOperationType = "SET_VALUE" | "INC_VALUE" | "DEC_VALUE" | "SET_RULE" | "SET_OWNER" | "SET_FUNC";

export type GetOperationType = "GET_VALUE" | "GET_RULE" | "GET_OWNER" | "GET_FUNC";

export type GetInputType = "VALUE" | "RULE" | "OWNER" | "FUNC";

export interface SetOperation {
  type: SetOperationType;
  ref: string;
  value: any | undefined | null;
}

export interface SetUpdateOperation {
  type: UpdateOperationType;
  update_list: SetOperation[];
}

export interface GetOperation {
  type: GetOperationType;
  ref: string;
}

export interface GetBatchOperation {
  type: BatchOperationType;
  batch_list: GetOperation[];
}

export interface PathValueObject {
  ref: string;
  value: any | undefined | null;
}

// export interface PathRuleObject

export interface PathFuncObject {
  ref: string;
  value: string;
}

export interface TransactionBodyBasics {
  parent_tx_hash?: string;
  operation: SetOperation | SetUpdateOperation | GetOperation | GetBatchOperation;
}

export interface ValueOnlyTransactionBodyBasics {
  parent_tx_hash?: string;
  value?: any;
}

export interface TransactionInputBasics {
  nonce?: number;
  isNonced?: boolean;
  address?: string;
}

export interface TransactionBody extends TransactionBodyBasics {
  nonce: number;
  timestamp: number;
}

export interface TransactionInput extends TransactionBodyBasics, TransactionInputBasics {}

export interface ValueOnlyTransactionInput extends ValueOnlyTransactionBodyBasics, TransactionInputBasics {}

export interface UpdatesTransactionInput extends TransactionInputBasics {
  parent_tx_hash?: string;
  update_list: SetOperation[];
}

export interface BatchTransactionInput {
  operation: GetOperation | GetBatchOperation;
}

export interface Transaction {
  tx_hash: string;
  block_hash?: string;
  block_number?: number;
  tx_index?: number;
  nonce: number;
  timestamp: number;
  from: string;
  operation: SetOperation | SetUpdateOperation | GetOperation | GetBatchOperation;
  parent_tx_hash?: string;
}

export interface TransactionResult {
  status: boolean,
  block_hash?: string,
  block_number?: number,
  tx_hash: string,
  tx_index?: number,
  from: string,
  parent_tx_hash?: string
}

export interface Block {
  number: number,
  hash?: string,
  parent_hash?: string,
  forger?: string,
  validators?: string[],
  size: number,
  timestamp?: number,
  transactions: Transaction[] | string[]
}

export interface ListenerMap {
  [key: string]: Function[]
}

export interface NodeInfo {
  name?: string,
  location?: string,
  version: string,
  endpoint: string
}
