import { AxiosRequestConfig } from "axios";
import {Signer} from "./signer/signer";

declare global {
  interface Window {
    ainetwork: Signer;
  }
}

/**
 * An interface for account.
 */
export interface Account {
  /** The address. */
  address: string;
  /** The private key. */
  private_key: string;
  /** The public key. */
  public_key: string;
}

/**
 * An interface for account list.
 */
export interface Accounts {[address: string]: Account}

/**
 * An interface for key derivation function parameters.
 */
export interface KdfParams {
  dklen: number;
  salt: string;
  prf?: string;
  c?: number;
  n?: number;
  r?: number;
  p?: number;
}

/**
 * An interface for v3 keystore options.
 */
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

/**
 * An interface for keystore files in Ethereum wallet format version 3.
 */
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

/**
 * A type for Ain options.
 */
export type AinOptions = {
  /** The raw result mode option. */
  rawResultMode?: boolean;
  /** The axios request config object.  */
  axiosConfig?: AxiosRequestConfig | undefined;
}

// export type EventType = "value" | "child_added" | "child_changed" | "child_removed";

/**
 * A type for multi-set (SET) operation type value.
 */
export type SetMultiOperationType = "SET";

/**
 * A type for set operation type values.
 */
export type SetOperationType = "SET_VALUE" | "INC_VALUE" | "DEC_VALUE" | "SET_RULE" | "SET_OWNER" | "SET_FUNCTION";

/**
 * A type for get operation type values.
 */
export type GetOperationType = "GET_VALUE" | "GET_RULE" | "GET_OWNER" | "GET_FUNCTION";

/**
 * A type for owner permission values.
 */
export type OwnerPermission = "branch_owner" | "write_function" | "write_owner" | "write_rule";

/**
 * A type for blockchain get API options.
 */
export type GetOptions = {
  is_global?: boolean;
  is_final?: boolean;
  is_shallow?: boolean;
  include_version?: boolean;
  include_tree_info?: boolean;
  include_proof?: boolean;
}

/**
 * An interface for blockchain set operation.
 */
export interface SetOperation {
  type: SetOperationType;
  ref: string;
  value: any | undefined | null;
  is_global?: boolean;
}

/**
 * An interface for blockchain multi-set (SET) operation.
 */
export interface SetMultiOperation {
  type: SetMultiOperationType;
  op_list: SetOperation[];
}

/**
 * An interface for blockchain get operation.
 */
export interface GetOperation extends GetOptions {
  type: GetOperationType;
  ref?: string;
}

/**
 * An interface for transaction body base.
 */
export interface TransactionBodyBase {
  parent_tx_hash?: string;
  operation: SetOperation | SetMultiOperation;
}

/**
 * An interface for value-only transaction body base.
 */
export interface ValueOnlyTransactionBodyBase {
  parent_tx_hash?: string;
  value?: any;
  ref?: string;
  is_global?: boolean;
}

/**
 * An interface for transaction input base.
 */
export interface TransactionInputBase {
  nonce?: number;
  address?: string;
  timestamp?: number;
  gas_price?: number;
  billing?: string;
}

/**
 * An interface for transaction body.
 */
export interface TransactionBody extends TransactionBodyBase {
  nonce: number;
  timestamp: number;
  gas_price?: number;
  billing?: string;
}

/**
 * An interface for transaction input.
 */
export interface TransactionInput extends TransactionBodyBase, TransactionInputBase {}

/**
 * An interface for value-only transaction input.
 */
export interface ValueOnlyTransactionInput extends ValueOnlyTransactionBodyBase, TransactionInputBase {}

/**
 * An interface for multi-set (SET) transaction input.
 */
export interface SetMultiTransactionInput extends TransactionInputBase {
  parent_tx_hash?: string;
  op_list?: SetOperation[];
}

/**
 * An interface for transaction.
 */
export interface Transaction {
  tx_body: TransactionBody;
  signature: string;
  hash: string;
  address: string;
}

/**
 * An interface for transaction information.
 */
export interface TransactionInfo {
  transaction: Transaction;
  status: string;
  number?: number;
  index: number;
  timestamp: number;
  is_finalized: boolean;
  finalized_at: number;
}

/**
 * An interface for transaction result.
 */
export interface TransactionResult {
  status: boolean;
  block_hash?: string;
  block_number?: number;
  hash: string;
  index?: number;
  address: string;
  parent_tx_hash?: string;
}

/**
 * An interface for blockchain block.
 */
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

/**
 * An interface for listener map.
 */
export interface ListenerMap {
  [key: string]: Function[];
}

/**
 * An interface for eval rule (EVAL_RULE) input.
 */
export interface EvalRuleInput {
  value: any;
  ref?: string;
  address?: string;
  timestamp?: number;
  is_global?: boolean;
}

/**
 * An interface for eval owner (EVAL_OWNER) input.
 */
export interface EvalOwnerInput {
  ref?: string;
  address?: string;
  permission: OwnerPermission;
  is_global?: boolean;
}

/**
 * An interface for match input.
 */
export interface MatchInput {
  ref?: string;
  is_global?: boolean;
}

/**
 * An interface for state usage information.
 */
export interface StateUsageInfo {
  tree_height?: number;
  tree_size?: number;
  tree_bytes?: number;
}

/**
 * An interface for app name validation information.
 */
export interface AppNameValidationInfo {
  is_valid: boolean;
  code: number;
  message?: string;
}

/**
 * A type for homomorphic encryption (HE) parameters.
 */
export type HomomorphicEncryptionParams = {
  polyModulusDegree: number;
  coeffModulusArray: Int32Array;
  scaleBit: number;
}

/**
 * A type for homomorphic encryption (HE) secret key.
 */
export type HomomorphicEncryptionSecretKey = {
  secretKey: string;
}

/**
 * Blockchain event types for blockchain event handler.
 */
export enum BlockchainEventTypes {
  BLOCK_FINALIZED = 'BLOCK_FINALIZED',
  VALUE_CHANGED = 'VALUE_CHANGED',
  TX_STATE_CHANGED = 'TX_STATE_CHANGED',
  FILTER_DELETED = 'FILTER_DELETED',
}

/**
 * Event channel message types for blockchain event handler.
 */
export enum EventChannelMessageTypes {
  REGISTER_FILTER = 'REGISTER_FILTER',
  DEREGISTER_FILTER = 'DEREGISTER_FILTER',
  EMIT_EVENT = 'EMIT_EVENT',
  EMIT_ERROR = 'EMIT_ERROR',
}

/**
 * An interface for event channel message (blockchain event handler).
 */
export interface EventChannelMessage {
  type: EventChannelMessageTypes;
  data: any;
}

/**
 * An interface for block-finalized event configuration (blockchain event handler).
 */
export interface BlockFinalizedEventConfig {
  block_number: number | null;
}

/**
 * A type for value-changed event source (blockchain event handler).
 */
export type ValueChangedEventSource = 'BLOCK' | 'USER';

/**
 * An interface for value-changed event configuraiton (blockchain event handler).
 */
export interface ValueChangedEventConfig {
  path: string;
  event_source: ValueChangedEventSource | null;
}

/**
 * An interface for transaction-state-changed event configuration (blockchain event handler).
 */
export interface TxStateChangedEventConfig {
  tx_hash: string;
}

/**
 * A type for event configuration (blockchain event handler).
 */
export type BlockchainEventConfig = BlockFinalizedEventConfig | ValueChangedEventConfig | TxStateChangedEventConfig;

/**
 * An interface for event-channel-connection options (blockchain event handler).
 */
export interface EventChannelConnectionOptions {
  handshakeTimeout?: number;
  heartbeatIntervalMs?: number;
}

/**
 * An interface for error handling callbacks (blockchain event handler).
 */
export interface ErrorFirstCallback<T> {
  (err: any, result?: undefined | null): void;
  (err: undefined | null, result: T): void;
}

/**
 * An interface for block-finalized event (blockchain event handler).
 */
export interface BlockFinalizedEvent {
  block_number: number;
  block_hash: string;
}

/**
 * An interface for value-changed event authentication (blockchain event handler).
 */
export interface ValueChangedEventAuth {
  addr?: string;
  fid?: string;
}

/**
 * An interface for value-changed event (blockchain event handler).
 */
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

/**
 * Transaction states for transaction-state-changed event (blockchain event handler).
 */
export enum TransactionStates {
  FINALIZED = 'FINALIZED',
  REVERTED = 'REVERTED',  // Failed but included in a block
  EXECUTED = 'EXECUTED',
  FAILED = 'FAILED',      // Failed and is NOT included in a block
  IN_BLOCK = 'IN_BLOCK',  // Included in a block, NOT reverted nor finalized.
  PENDING = 'PENDING',
  TIMED_OUT = 'TIMED_OUT',
};

/**
 * An interface for transaction-state-changed event (blockchain event handler).
 */
export interface TxStateChangedEvent {
  transaction: Transaction;
  tx_state: {
    before: TransactionStates;
    after: TransactionStates;
  };
}

/**
 * Filter deletion reasons (blockchain event handler).
 */
export enum FilterDeletionReasons {
  FILTER_TIMEOUT = 'FILTER_TIMEOUT',
  END_STATE_REACHED = 'END_STATE_REACHED',
}

/**
 * An interface for filter-deleted event (blockchain event handler).
 */
export interface FilterDeletedEvent {
  filter_id: string;
  reason: FilterDeletionReasons;
}

/**
 * An interface for blockchain event callback (blockchain event handler).
 */
export interface BlockchainEventCallback {
  (event: BlockFinalizedEvent): void;
  (event: ValueChangedEvent): void;
  (event: TxStateChangedEvent): void;
}

/**
 * A type for filter-deleted event callback (blockchain event handler).
 */
export type FilterDeletedEventCallback = (event: FilterDeletedEvent) => void;

/**
 * A type for disconnected callback (blockchain event handler).
 */
export type DisconnectCallback = (webSocket) => void;
