export interface Account {
  address: string;
  private_key: string;
  public_key: string;
}

export interface Accounts {[address: string]: Account}

export interface KdfParams {
  dklen: number;
  salt: string;
  prf?: string;
  c?: number;
  n?: number;
  r?: number;
  p?: number;
}

export interface V3KeystoreOptions {
  salt?: string;
  iv?: Buffer;
  kdf?: string;
  dklen?: number;
  c?: number;
  n?: number;
  r?: number;
  p?: number;
  prf?: string;
  cipher?: string;
  uuid?: Buffer;
}

export interface V3Keystore {
  version: 3;
  id: string;
  address: string;
  crypto: {
    ciphertext: string,
    cipherparams: {
      iv: string
    },
    cipher: string,
    kdf: string,
    kdfparams: KdfParams,
    mac: string
  };
}

export type AinOptions = {
  rawResultMode?: boolean;
}

// export type EventType = "value" | "child_added" | "child_changed" | "child_removed";

export type SetMultiOperationType = "SET";

export type GetMultiOperationType = "GET";

export type SetOperationType = "SET_VALUE" | "INC_VALUE" | "DEC_VALUE" | "SET_RULE" | "SET_OWNER" | "SET_FUNCTION";

export type GetOperationType = "GET_VALUE" | "GET_RULE" | "GET_OWNER" | "GET_FUNCTION";

export type OwnerPermission = "branch_owner" | "write_function" | "write_owner" | "write_rule";

export type GetOptions = {
  is_global?: boolean;
  is_final?: boolean;
  is_shallow?: boolean;
  include_version?: boolean;
  include_tree_info?: boolean;
  include_proof?: boolean;
}

export interface SetOperation {
  type: SetOperationType;
  ref: string;
  value: any | undefined | null;
  is_global?: boolean;
}

export interface SetMultiOperation {
  type: SetMultiOperationType;
  op_list: SetOperation[];
}

export interface GetOperation extends GetOptions {
  type: GetOperationType;
  ref?: string;
}

export interface GetMultiOperation {
  type: GetMultiOperationType;
  op_list: GetOperation[];
}

export interface TransactionBodyBase {
  parent_tx_hash?: string;
  operation: SetOperation | SetMultiOperation;
}

export interface ValueOnlyTransactionBodyBase {
  parent_tx_hash?: string;
  value?: any;
  ref?: string;
  is_global?: boolean;
}

export interface TransactionInputBase {
  nonce?: number;
  address?: string;
  timestamp?: number;
  gas_price?: number;
  billing?: string;
}

export interface TransactionBody extends TransactionBodyBase {
  nonce: number;
  timestamp: number;
  gas_price?: number;
  billing?: string;
}

export interface TransactionInput extends TransactionBodyBase, TransactionInputBase {}

export interface ValueOnlyTransactionInput extends ValueOnlyTransactionBodyBase, TransactionInputBase {}

export interface SetMultiTransactionInput extends TransactionInputBase {
  parent_tx_hash?: string;
  op_list: SetOperation[];
}

export interface Transaction {
  tx_body: TransactionBody;
  signature: string;
  hash: string;
  address: string;
}

export interface TransactionInfo {
  transaction: Transaction;
  status: string;
  number?: number;
  index: number;
  timestamp: number;
  is_finalized: boolean;
  finalized_at: number;
}

export interface TransactionResult {
  status: boolean;
  block_hash?: string;
  block_number?: number;
  hash: string;
  index?: number;
  address: string;
  parent_tx_hash?: string;
}

export interface Block {
  number: number;
  epoch: number;
  hash: string;
  last_hash: string;
  proposer: string;
  validators: any;
  size: number;
  timestamp: number;
  transactions: Transaction[];
  last_votes: Transaction[];
  stateProofHash: string;
  last_votes_hash: string;
  transactions_hash: string;
}

export interface ListenerMap {
  [key: string]: Function[];
}

export interface EvalRuleInput {
  value: any;
  ref?: string;
  address?: string;
  timestamp?: number;
  is_global?: boolean;
}

export interface EvalOwnerInput {
  ref?: string;
  address?: string;
  permission: OwnerPermission;
  is_global?: boolean;
}

export interface MatchInput {
  ref?: string;
  is_global?: boolean;
}

export interface StateUsageInfo {
  tree_height?: number;
  tree_size?: number;
  tree_bytes?: number;
}

export interface AppNameValidationInfo {
  is_valid: boolean;
  code: number;
  message?: string;
}

export type HomomorphicEncryptionParams = {
  polyModulusDegree: number;
  coeffModulusArray: Int32Array;
  scaleBit: number;
}

export type HomomorphicEncryptionSecretKey = {
  secretKey: string;
}

export enum BlockchainEventTypes {
  BLOCK_FINALIZED = 'BLOCK_FINALIZED',
  VALUE_CHANGED = 'VALUE_CHANGED',
  TX_STATE_CHANGED = 'TX_STATE_CHANGED',
  FILTER_DELETED = 'FILTER_DELETED',
}

export enum EventChannelMessageTypes {
  REGISTER_FILTER = 'REGISTER_FILTER',
  DEREGISTER_FILTER = 'DEREGISTER_FILTER',
  EMIT_EVENT = 'EMIT_EVENT',
  EMIT_ERROR = 'EMIT_ERROR',
}

export interface EventChannelMessage {
  type: EventChannelMessageTypes;
  data: any;
}

export interface BlockFinalizedEventConfig {
  block_number: number | null;
}

export type ValueChangedEventSource = 'BLOCK' | 'USER';

export interface ValueChangedEventConfig {
  path: string;
  event_source: ValueChangedEventSource | null;
}

export interface TxStateChangedEventConfig {
  tx_hash: string;
}

export type EventConfigType = BlockFinalizedEventConfig | ValueChangedEventConfig | TxStateChangedEventConfig;

export interface EventChannelConnectionOption {
  handshakeTimeout?: number;
  heartbeatIntervalMs?: number;
}

export interface ErrorFirstCallback<T> {
  (err: any, result?: undefined | null): void;
  (err: undefined | null, result: T): void;
}

export interface BlockFinalizedEvent {
  block_number: number;
  block_hash: string;
}

export interface ValueChangedEventAuth {
  addr?: string;
  fid?: string;
}

export interface ValueChangedEvent {
  filter_path: string;
  matched_path: string;
  params: any;
  transaction: Transaction;
  event_source: ValueChangedEventSource;
  auth: ValueChangedEventAuth;
  values: {
    before: any;
    after: any;
  };
}

export enum TransactionStates {
  FINALIZED = 'FINALIZED',
  REVERTED = 'REVERTED', // Reverted means it's failed but included in a block
  EXECUTED = 'EXECUTED',
  FAILED = 'FAILED', // Failed means it's failed and is NOT included in a block
  PENDING = 'PENDING',
  TIMED_OUT = 'TIMED_OUT',
}

export interface TxStateChangedEvent {
  transaction: Transaction;
  tx_state: {
    before: TransactionStates;
    after: TransactionStates;
  };
}

export enum FilterDeletionReasons {
  FILTER_TIMEOUT = 'FILTER_TIMEOUT',
  END_STATE_REACHED = 'END_STATE_REACHED',
}

export interface FilterDeletedEvent {
  filter_id: string;
  reason: FilterDeletionReasons;
}

export interface BlockchainEventCallback {
  (event: BlockFinalizedEvent): void;
  (event: ValueChangedEvent): void;
  (event: TxStateChangedEvent): void;
}

export type FilterDeletedEventCallback = (event: FilterDeletedEvent) => void;

export type DisconnectCallback = (webSocket) => void;
