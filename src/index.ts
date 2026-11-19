import algosdk from 'algosdk';
import {
  InvalidOptionsError,
  InvalidPaymentRequiredError,
  NetworkMismatchError,
  NoSupportedRequirementError,
  PaymentNotAllowedError,
  SpendLimitExceededError,
  UnknownNetworkError,
  X402AvmError,
} from './errors.js';

export {
  InvalidOptionsError,
  InvalidPaymentRequiredError,
  NetworkMismatchError,
  NoSupportedRequirementError,
  PaymentNotAllowedError,
  SpendLimitExceededError,
  UnknownNetworkError,
  X402AvmError,
};

/**
 * Payment requirements specified by an x402 server.
 *
 * Defines the scheme, CAIP-2 network, asset ID (0 for ALGO), amount in base units,
 * recipient address, timeout, and optional extra metadata such as fee payer and token decimals.
 *
 * @example
 * ```ts
 * const req: PaymentRequirements = {
 *   scheme: 'exact',
 *   network: 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k',
 *   asset: '0',
 *   amount: '5000',
 *   payTo: 'DN74O524ODU54DND7U42G3...LN7L7Y',
 *   maxTimeoutSeconds: 300,
 *   extra: { feePayer: 'FEEPAYER...' }
 * };
 * ```
 */
export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: {
    feePayer?: string;
    decimals?: number;
    genesisHash?: string;
    genesisId?: string;
    [key: string]: unknown;
  };
}

/**
 * Metadata about the protected resource in an x402 payment challenge.
 *
 * @example
 * ```ts
 * const resource: ResourceInfo = {
 *   url: 'https://api.example.com/v1/tools/translate',
 *   description: 'Machine translation service',
 *   mimeType: 'application/json'
 * };
 * ```
 */
export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

/**
 * Decoded payload of the HTTP 402 PAYMENT-REQUIRED header.
 *
 * Contains the x402 protocol version (2), optional error string, protected resource info,
 * list of acceptable payment requirements, and optional extensions.
 *
 * @example
 * ```ts
 * const challenge: PaymentRequired = {
 *   x402Version: 2,
 *   accepts: [
 *     {
 *       scheme: 'exact',
 *       network: 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k',
 *       asset: '0',
 *       amount: '10000',
 *       payTo: 'RECEIVER_ADDRESS',
 *       maxTimeoutSeconds: 300
 *     }
 *   ]
 * };
 * ```
 */
export interface PaymentRequired {
  x402Version: number;
  error?: string | null;
  resource?: ResourceInfo | null;
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown> | null;
}

/**
 * Result of building an atomic transaction group for the exact AVM payment scheme.
 *
 * @example
 * ```ts
 * const { txns, paymentIndex, signIndexes }: BuildGroupResult = buildExactAvmGroup(
 *   requirement,
 *   payerAddress,
 *   suggestedParams
 * );
 * ```
 */
export interface BuildGroupResult {
  txns: algosdk.Transaction[];
  paymentIndex: number;
  signIndexes: number[];
}

// ---------------------------------------------------------------- networks

/**
 * Network configuration and endpoints for an Algorand network.
 *
 * @example
 * ```ts
 * const net: AlgorandNetwork = MAINNET;
 * console.log(net.caip2, net.algodUrl);
 * ```
 */
export interface AlgorandNetwork {
  /** CAIP-2 id, "algorand:<genesis hash>" */
  caip2: string;
  genesisHash: string;
  genesisId: string;
  algodUrl: string;
  indexerUrl: string;
  /** Circle USDC asset id, where it exists */
  usdc?: number;
}

/**
 * MainNet network constants and public AlgoNode endpoints.
 *
 * @example
 * ```ts
 * import { MAINNET } from 'x402-avm-js';
 * console.log(MAINNET.genesisId); // 'mainnet-v1.0'
 * console.log(MAINNET.usdc); // 31566704
 * ```
 */
export const MAINNET: AlgorandNetwork = {
  caip2: 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k',
  genesisHash: 'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=',
  genesisId: 'mainnet-v1.0',
  algodUrl: 'https://mainnet-api.algonode.cloud',
  indexerUrl: 'https://mainnet-idx.algonode.cloud',
  usdc: 31566704,
};

/**
 * TestNet network constants and public AlgoNode endpoints.
 *
 * @example
 * ```ts
 * import { TESTNET } from 'x402-avm-js';
 * console.log(TESTNET.genesisId); // 'testnet-v1.0'
 * console.log(TESTNET.usdc); // 10458941
 * ```
 */
export const TESTNET: AlgorandNetwork = {
  caip2: 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe',
  genesisHash: 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
  genesisId: 'testnet-v1.0',
  algodUrl: 'https://testnet-api.algonode.cloud',
  indexerUrl: 'https://testnet-idx.algonode.cloud',
  usdc: 10458941,
};

/**
 * LocalNet endpoints and token.
 *
 * Because LocalNet genesis hash changes on every sandbox reset,
 * use `networkFromAlgod()` to retrieve its dynamic CAIP-2 network identifier.
 *
 * @example
 * ```ts
 * import { LOCALNET_ENDPOINTS } from 'x402-avm-js';
 * console.log(LOCALNET_ENDPOINTS.algodUrl); // 'http://localhost:4001'
 * ```
 */
export const LOCALNET_ENDPOINTS = {
  algodUrl: 'http://localhost:4001',
  algodToken: 'a'.repeat(64),
  indexerUrl: 'http://localhost:8980',
} as const;

const ALIASES: Record<string, AlgorandNetwork> = {
  mainnet: MAINNET,
  'algorand-mainnet': MAINNET,
  algorand: MAINNET,
  testnet: TESTNET,
  'algorand-testnet': TESTNET,
  [MAINNET.caip2]: MAINNET,
  [TESTNET.caip2]: TESTNET,
  'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=': MAINNET,
  'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=': TESTNET,
};

/**
 * Resolve a network name, alias, or legacy ID into a canonical CAIP-2 identifier.
 *
 * Accepts aliases ("mainnet", "testnet", "algorand-mainnet", "algorand-testnet", "algorand"),
 * canonical CAIP-2 strings ("algorand:<32-char-reference>"), or legacy long CAIP-2 strings
 * ("algorand:<full-base64-genesis-hash>").
 * For LocalNet, query the daemon with `networkFromAlgod(algod)`.
 *
 * @param network - Network name alias or CAIP-2 string.
 * @returns Canonical CAIP-2 network string.
 * @throws {UnknownNetworkError} If the network name or CAIP-2 string is unrecognized.
 *
 * @example
 * ```ts
 * const caip2 = resolveNetwork('mainnet');
 * // 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k'
 * ```
 */
export function resolveNetwork(network: string): string {
  const known = ALIASES[network] ?? ALIASES[network.toLowerCase()];
  if (known) return known.caip2;
  if (/^algorand:[-_A-Za-z0-9]{1,32}$/.test(network)) return network;
  const legacyMatch = /^algorand:([A-Za-z0-9+/]{43}=)$/.exec(network);
  if (legacyMatch) return networkFromGenesisHash(legacyMatch[1]);
  throw new UnknownNetworkError(`Unknown network "${network}": use "mainnet", "testnet" or "algorand:<genesis hash>" (for LocalNet, networkFromAlgod(algod))`, network);
}

/**
 * Derive the canonical CAIP-2 identifier from a network's genesis hash per the Algorand profile.
 *
 * Computes URL-safe base64 of the genesis hash (with + -> -, / -> _, stripped padding)
 * and truncates to the first 32 characters as the CAIP-2 reference.
 *
 * @param genesisHash - 32-byte genesis hash as a Uint8Array or base64-encoded string.
 * @returns Canonical CAIP-2 identifier formatted as "algorand:<32-char-urlsafe-base64>".
 *
 * @example
 * ```ts
 * const caip2 = networkFromGenesisHash('wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=');
 * // 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k'
 * ```
 */
export function networkFromGenesisHash(genesisHash: Uint8Array | string): string {
  const bytes = typeof genesisHash === 'string' ? algosdk.base64ToBytes(genesisHash) : genesisHash;
  const b64 = algosdk.bytesToBase64(bytes);
  const urlSafe = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `algorand:${urlSafe.slice(0, 32)}`;
}

/**
 * Query an algod client for its current suggested transaction parameters and return its CAIP-2 identifier.
 *
 * Works with any Algorand node, including LocalNet instances and private testnets where the genesis hash
 * cannot be known in advance.
 *
 * @param algod - Algodv2 client instance.
 * @returns Promise resolving to the canonical CAIP-2 network identifier.
 * @throws {X402AvmError} If the algod node does not return a genesisHash (network errors from algod propagate unchanged).
 *
 * @example
 * ```ts
 * const algod = algodClient('localnet');
 * const networkId = await networkFromAlgod(algod);
 * console.log(networkId); // 'algorand:' followed by the genesis hash, e.g. TestNet's CAIP-2 id
 * ```
 */
export async function networkFromAlgod(algod: algosdk.Algodv2): Promise<string> {
  const sp = await algod.getTransactionParams().do();
  if (!sp.genesisHash) throw new X402AvmError('algod did not return a genesis hash', 'no_genesis_hash');
  return networkFromGenesisHash(sp.genesisHash);
}

/**
 * Create an Algodv2 client for a named network or custom endpoint.
 *
 * Connects to public AlgoNode endpoints for "mainnet" and "testnet", or default
 * credentials (port 4001, token of 64 'a's) for "localnet". For private networks,
 * pass the node's URL explicitly.
 *
 * @param network - Network name ('mainnet', 'testnet', 'localnet', or CAIP-2 string).
 * @param url - Optional custom algod base URL.
 * @param token - Optional authentication token or header.
 * @returns Configured Algodv2 client.
 * @throws {UnknownNetworkError} If network has no default endpoint and url is omitted.
 *
 * @example
 * ```ts
 * const client = algodClient('testnet'); // https://testnet-api.algonode.cloud
 * const localClient = algodClient('localnet'); // http://localhost:4001
 * const status = await localClient.status().do();
 * const privateNode = algodClient('my-private-net', 'http://10.0.0.5:4001', 'my-token');
 * ```
 */
export function algodClient(network: string, url?: string, token?: string): algosdk.Algodv2 {
  if (network.toLowerCase() === 'localnet') {
    return new algosdk.Algodv2(token ?? LOCALNET_ENDPOINTS.algodToken, url ?? LOCALNET_ENDPOINTS.algodUrl, undefined);
  }
  const known = ALIASES[network] ?? ALIASES[network.toLowerCase()];
  if (!known && !url) throw new UnknownNetworkError(`No default endpoint for network "${network}": pass its algod URL`, network);
  return new algosdk.Algodv2(token ?? '', url ?? known!.algodUrl, undefined);
}

/**
 * Select the first acceptable payment requirement matching the payer's network.
 *
 * Searches the `accepts` array of a PaymentRequired challenge for an offer using the "exact"
 * payment scheme matching the specified network (resolved via `resolveNetwork`).
 *
 * @param paymentRequired - Parsed PaymentRequired object (anything with an `accepts` array).
 * @param network - Desired network name, alias, or CAIP-2 identifier.
 * @returns The matching PaymentRequirements entry.
 * @throws {NoSupportedRequirementError} If `accepts` is empty.
 * @throws {NetworkMismatchError} If no requirement matches the requested network.
 *
 * @example
 * ```ts
 * const req = selectRequirement(paymentRequired, 'mainnet');
 * console.log(`Pay ${req.amount} microALGO to ${req.payTo}`);
 * ```
 */
export function selectRequirement(paymentRequired: Pick<PaymentRequired, 'accepts'>, network: string): PaymentRequirements {
  const accepts: PaymentRequirements[] = paymentRequired?.accepts ?? [];
  if (!accepts.length) {
    throw new NoSupportedRequirementError();
  }
  const want = resolveNetwork(network);
  const match = accepts.find((a) => a.scheme === 'exact' && safeResolve(a.network) === want);
  if (!match) {
    const offered = [...new Set(accepts.map((a) => a.network))].join(', ');
    throw new NetworkMismatchError(
      `The server asks for payment on ${offered}, but this wallet is on ${want}`,
      [...new Set(accepts.map((a) => a.network))],
      want
    );
  }
  return match;
}

function safeResolve(n: string): string | null {
  try {
    return resolveNetwork(n);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- payments

function getNs(): string {
  const p = (globalThis as { process?: { hrtime?: { bigint?: () => bigint } } }).process;
  if (p?.hrtime && typeof p.hrtime.bigint === 'function') {
    return p.hrtime.bigint().toString();
  }
  return `${Date.now()}000000`;
}

/**
 * Decode a base64-encoded PAYMENT-REQUIRED header value into a PaymentRequired object.
 *
 * Parses the base64-encoded JSON payload received in an HTTP 402 response into a typed
 * PaymentRequired structure without relying on Node.js binary APIs.
 *
 * @param headerB64 - Base64-encoded string from the PAYMENT-REQUIRED response header.
 * @returns Decoded PaymentRequired object.
 * @throws {InvalidPaymentRequiredError} If decoding or JSON parsing fails, or the decoded shape is invalid.
 *
 * @example
 * ```ts
 * const header = response.headers.get('PAYMENT-REQUIRED');
 * const challenge = decodePaymentRequired(header);
 * console.log(challenge.x402Version); // 2
 * ```
 */
export function decodePaymentRequired(headerB64: string): PaymentRequired {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(algosdk.base64ToBytes(headerB64.trim())));
  } catch (cause) {
    throw new InvalidPaymentRequiredError('PAYMENT-REQUIRED header is not base64-encoded JSON', { cause });
  }
  return parsePaymentRequired(parsed);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate untrusted input (for example a decoded PAYMENT-REQUIRED header) and return it as a
 * {@link PaymentRequired}. Every `accepts` entry must have string `scheme`, `network`, `asset`,
 * `amount` (a non-negative integer), `payTo`, and a numeric `maxTimeoutSeconds`.
 *
 * @param value - Parsed JSON of unknown shape.
 * @throws {InvalidPaymentRequiredError} If the shape is wrong.
 */
export function parsePaymentRequired(value: unknown): PaymentRequired {
  if (!isRecord(value)) throw new InvalidPaymentRequiredError('PaymentRequired must be a JSON object');
  if (typeof value.x402Version !== 'number') throw new InvalidPaymentRequiredError('PaymentRequired.x402Version must be a number');
  if (!Array.isArray(value.accepts)) throw new InvalidPaymentRequiredError('PaymentRequired.accepts must be an array');
  value.accepts.forEach((a: unknown, i: number) => {
    if (!isRecord(a)) throw new InvalidPaymentRequiredError(`accepts[${i}] must be an object`);
    for (const k of ['scheme', 'network', 'asset', 'amount', 'payTo'] as const) {
      if (typeof a[k] !== 'string') throw new InvalidPaymentRequiredError(`accepts[${i}].${k} must be a string`);
    }
    if (!/^\d+$/.test(a.amount as string)) throw new InvalidPaymentRequiredError(`accepts[${i}].amount must be a non-negative integer string`);
    if (!/^\d+$/.test(a.asset as string)) throw new InvalidPaymentRequiredError(`accepts[${i}].asset must be an asset id string ("0" for ALGO)`);
    if (typeof a.maxTimeoutSeconds !== 'number') throw new InvalidPaymentRequiredError(`accepts[${i}].maxTimeoutSeconds must be a number`);
    if (a.extra !== undefined && a.extra !== null && !isRecord(a.extra)) throw new InvalidPaymentRequiredError(`accepts[${i}].extra must be an object`);
  });
  return value as unknown as PaymentRequired;
}

// ---------------------------------------------------------------- spend controls

/** Default per-payment cap in base units (1 ALGO, or 1 USDC) applied when `maxAmount` is not set. */
export const DEFAULT_MAX_AMOUNT = 1_000_000n;

/** A limit in base units: bigint, a non-negative safe integer, a decimal string, or `Infinity` for no cap. */
export type AmountLimit = bigint | number | string;

/**
 * Client-side limits checked before anything is signed.
 *
 * The server chooses the amount in a 402 challenge, so a hostile or buggy server could ask for any amount.
 * These controls bound what the client will agree to.
 */
export interface SpendControls {
  /**
   * Maximum amount per payment in base units. A single value applies to every asset; a record maps
   * asset ids (`"0"` for ALGO) to limits, with `"*"` as the fallback for assets not listed. Anything
   * not covered falls back to {@link DEFAULT_MAX_AMOUNT}. Pass `Infinity` to remove the cap.
   */
  maxAmount?: AmountLimit | Record<string, AmountLimit>;
  /** If set, only these asset ids may be paid. */
  allowedAssets?: Array<string | number | bigint>;
  /** If set, only these networks (names or CAIP-2 ids) may be paid. */
  allowedNetworks?: string[];
  /** If set, only these recipient addresses may be paid. */
  allowedPayTo?: string[];
}

function parseLimit(v: AmountLimit, what: string): bigint | null {
  if (typeof v === 'bigint' && v >= 0n) return v;
  if (typeof v === 'number') {
    if (v === Infinity) return null;
    if (Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  }
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  throw new InvalidOptionsError(`${what} must be a non-negative integer (bigint, number, or numeric string) or Infinity`);
}

function limitFor(maxAmount: SpendControls['maxAmount'], asset: string): bigint | null {
  if (maxAmount === undefined) return DEFAULT_MAX_AMOUNT;
  if (isRecord(maxAmount)) {
    const v = maxAmount[asset] ?? maxAmount['*'];
    return v === undefined ? DEFAULT_MAX_AMOUNT : parseLimit(v, `maxAmount[${asset}]`);
  }
  return parseLimit(maxAmount as AmountLimit, 'maxAmount');
}

function parseUint(v: string, what: string): bigint {
  if (!/^\d+$/.test(v)) throw new InvalidPaymentRequiredError(`${what} must be a non-negative integer string, got "${v}"`);
  const n = BigInt(v);
  if (n > 0xffffffffffffffffn) throw new InvalidPaymentRequiredError(`${what} exceeds 64 bits`);
  return n;
}

/**
 * Check a requirement against spend controls. Throws before anything is built or signed.
 *
 * @throws {SpendLimitExceededError} If the amount is above the cap (default {@link DEFAULT_MAX_AMOUNT}).
 * @throws {PaymentNotAllowedError} If the asset, network or recipient is not on an allow list.
 * @throws {InvalidOptionsError} If a control is malformed.
 * @throws {InvalidPaymentRequiredError} If the requirement's amount or asset is not an unsigned integer.
 */
export function checkSpendControls(req: PaymentRequirements, controls: SpendControls = {}): void {
  const amount = parseUint(req.amount, 'amount');
  const asset = parseUint(req.asset, 'asset').toString();

  const limit = limitFor(controls.maxAmount, asset);
  if (limit !== null && amount > limit) throw new SpendLimitExceededError(asset, amount, limit);

  if (controls.allowedAssets && !controls.allowedAssets.some((a) => String(a) === asset)) {
    throw new PaymentNotAllowedError('asset', asset);
  }
  if (controls.allowedNetworks) {
    const net = safeResolve(req.network);
    const ok = net !== null && controls.allowedNetworks.some((n) => safeResolve(n) === net);
    if (!ok) throw new PaymentNotAllowedError('network', req.network);
  }
  if (controls.allowedPayTo && !controls.allowedPayTo.includes(req.payTo)) {
    throw new PaymentNotAllowedError('payTo', req.payTo);
  }
}

/**
 * Build atomic transaction group for Exact AVM payment scheme.
 *
 * If `extra.feePayer` is present in the requirement:
 * Creates a two-transaction atomic group:
 * 1. Transaction [0]: Fee payer self-payment of 0 ALGO with pooled flat fee equal to `2 * minFee` (2,000 microALGO).
 * 2. Transaction [1]: Payer transfer of `amount` with flat fee of 0.
 * Sets `paymentIndex = 1` and `signIndexes = [1]`.
 *
 * If `extra.feePayer` is absent:
 * Creates a single transaction where the payer pays the standard fee:
 * Sets `paymentIndex = 0` and `signIndexes = [0]`.
 *
 * Handles both native ALGO (asset ID "0") and Algorand Standard Assets (ASAs).
 *
 * @param req - Accepted payment requirement from the server.
 * @param payerAddress - Algorand address of the buyer/payer.
 * @param suggestedParams - Current suggested transaction parameters from algod.
 * @param controls - Spend controls checked before anything is built. Without `maxAmount`, amounts above
 *   {@link DEFAULT_MAX_AMOUNT} (1,000,000 base units) are refused.
 * @returns Object containing the transaction group, payment transaction index, and indexes requiring signature.
 * @throws {SpendLimitExceededError} If the amount is above the cap.
 * @throws {PaymentNotAllowedError} If the asset, network or recipient is not allowed.
 * @throws {NetworkMismatchError} If `extra.genesisHash` or `extra.genesisId` disagrees with `suggestedParams`.
 * @throws {InvalidPaymentRequiredError} If the amount, asset, payTo or feePayer is malformed.
 *
 * @example
 * ```ts
 * const sp = await algod.getTransactionParams().do();
 * const { txns, paymentIndex, signIndexes } = buildExactAvmGroup(
 *   requirement,
 *   activeAddress,
 *   sp
 * );
 * ```
 */
export function buildExactAvmGroup(
  req: PaymentRequirements,
  payerAddress: string,
  suggestedParams: algosdk.SuggestedParams,
  controls: SpendControls = {}
): BuildGroupResult {
  checkSpendControls(req, controls);

  const extra = req.extra || {};
  const feePayer = extra.feePayer;

  if (!algosdk.isValidAddress(req.payTo)) {
    throw new InvalidPaymentRequiredError(`payTo "${req.payTo}" is not a valid Algorand address`);
  }
  if (feePayer !== undefined && (typeof feePayer !== 'string' || !algosdk.isValidAddress(feePayer))) {
    throw new InvalidPaymentRequiredError('extra.feePayer is not a valid Algorand address');
  }
  if (typeof extra.genesisHash === 'string' && suggestedParams.genesisHash) {
    const have = algosdk.bytesToBase64(suggestedParams.genesisHash);
    if (extra.genesisHash !== have) {
      throw new NetworkMismatchError(
        `The requirement is for genesis ${extra.genesisHash}, but this algod is on ${have}`,
        [extra.genesisHash],
        have
      );
    }
  }
  if (typeof extra.genesisId === 'string' && suggestedParams.genesisID && extra.genesisId !== suggestedParams.genesisID) {
    throw new NetworkMismatchError(
      `The requirement is for ${extra.genesisId}, but this algod is on ${suggestedParams.genesisID}`,
      [extra.genesisId],
      suggestedParams.genesisID
    );
  }

  const transactions: algosdk.Transaction[] = [];
  let paymentIndex: number;
  let signIndexes: number[];

  if (feePayer) {
    const minFee = suggestedParams.minFee ? Number(suggestedParams.minFee) : 1000;
    const pooledFee = minFee * 2;

    const feePayerSp: algosdk.SuggestedParams = {
      ...suggestedParams,
      fee: BigInt(pooledFee),
      flatFee: true,
    };

    const feePayerTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: feePayer,
      receiver: feePayer,
      amount: 0,
      suggestedParams: feePayerSp,
      note: new TextEncoder().encode(`x402-fee-payer-${getNs()}`),
    });
    transactions.push(feePayerTxn);

    paymentIndex = 1;
    signIndexes = [1];
  } else {
    paymentIndex = 0;
    signIndexes = [0];
  }

  const assetId = Number(parseUint(req.asset, 'asset'));
  const amount = parseUint(req.amount, 'amount');

  const payerSp: algosdk.SuggestedParams = {
    ...suggestedParams,
    fee: feePayer ? 0n : (suggestedParams.fee ?? 1000n),
    flatFee: feePayer ? true : (suggestedParams.flatFee ?? false),
  };

  const paymentNote = new TextEncoder().encode(`x402-payment-${getNs()}`);

  let paymentTxn: algosdk.Transaction;
  if (assetId === 0) {
    paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: payerAddress,
      receiver: req.payTo,
      amount,
      suggestedParams: payerSp,
      note: paymentNote,
    });
  } else {
    paymentTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: payerAddress,
      receiver: req.payTo,
      assetIndex: assetId,
      amount,
      suggestedParams: payerSp,
      note: paymentNote,
    });
  }
  transactions.push(paymentTxn);

  if (transactions.length > 1) {
    algosdk.assignGroupID(transactions);
  }

  return { txns: transactions, paymentIndex, signIndexes };
}

/**
 * Encode a payment payload into a base64-encoded PAYMENT-SIGNATURE header.
 *
 * Constructs the standard x402 v2 payment response object containing `accepted` requirements,
 * the base64-encoded transaction group (signed or unsigned), the `paymentIndex`, and any
 * resource or extensions metadata copied from the original challenge.
 *
 * @param paymentRequired - The original PaymentRequired challenge object.
 * @param accepted - The selected and fulfilled PaymentRequirements item.
 * @param groupB64 - Array of base64-encoded transactions (signed bytes or unsigned fallback).
 * @param paymentIndex - 0-based index of the payment transaction within the group.
 * @returns Base64-encoded string ready to pass in the `PAYMENT-SIGNATURE` HTTP header.
 *
 * @example
 * ```ts
 * const header = encodePaymentHeader(challenge, accepted, groupB64, paymentIndex);
 * const response = await fetch(url, {
 *   headers: { 'PAYMENT-SIGNATURE': header }
 * });
 * ```
 */
export function encodePaymentHeader(
  paymentRequired: PaymentRequired,
  accepted: PaymentRequirements,
  groupB64: string[],
  paymentIndex: number
): string {
  const payloadObj: Record<string, unknown> = {
    x402Version: 2,
    accepted,
    payload: {
      paymentGroup: groupB64,
      paymentIndex,
    },
  };

  if (paymentRequired.resource) {
    payloadObj.resource = paymentRequired.resource;
  }
  if (paymentRequired.extensions) {
    payloadObj.extensions = paymentRequired.extensions;
  }

  return algosdk.bytesToBase64(new TextEncoder().encode(JSON.stringify(payloadObj)));
}

/**
 * Helper to execute full payment flow for an x402 payment challenge.
 *
 * Automates the complete client payment workflow:
 * 1. Fetches current suggested transaction parameters from the algod client.
 * 2. Matches the requirement against the active algod network using `selectRequirement`.
 * 3. Builds the exact AVM atomic transaction group via `buildExactAvmGroup`.
 * 4. Calls `signTxns` for the transaction indexes requiring payer signature.
 * 5. Assembles signed and unsigned transactions and encodes the `PAYMENT-SIGNATURE` header.
 *
 * @param paymentRequired - The PaymentRequired challenge from HTTP 402 response.
 * @param payerAddress - Algorand address of the paying account.
 * @param algod - Algodv2 client instance for the active network.
 * @param signTxns - Callback function that signs unsigned transaction byte arrays for specified indexes.
 * @param controls - Spend controls. By default a payment above 1,000,000 base units is refused before
 *   `signTxns` is called; raise it with `maxAmount`. See {@link SpendControls}.
 * @returns Promise resolving to the base64-encoded `PAYMENT-SIGNATURE` header string.
 * @throws {NoSupportedRequirementError} If `accepts` is empty.
 * @throws {NetworkMismatchError} If no offer is for the algod's network.
 * @throws {SpendLimitExceededError} If the amount is above the cap.
 * @throws {PaymentNotAllowedError} If the asset, network or recipient is not allowed.
 * Errors from algod or from `signTxns` propagate unchanged.
 *
 * @example
 * ```ts
 * const paymentSignature = await payForRequirement(
 *   challenge,
 *   activeAddress,
 *   algod,
 *   async (txns, indexes) => {
 *     return await signTransactions(txns, indexes);
 *   }
 * );
 * ```
 */
export async function payForRequirement(
  paymentRequired: PaymentRequired,
  payerAddress: string,
  algod: algosdk.Algodv2,
  signTxns: (txns: Uint8Array[], indexes: number[]) => Promise<(Uint8Array | null)[]>,
  controls: SpendControls = {}
): Promise<string> {
  const sp = await algod.getTransactionParams().do();
  // Pay only an offer for the network this algod is on: a payment signed for another network is useless,
  // and choosing by network lets one server offer several (e.g. MainNet USDC and TestNet ALGO).
  const accepted = selectRequirement(paymentRequired, networkFromGenesisHash(sp.genesisHash));
  const { txns, paymentIndex, signIndexes } = buildExactAvmGroup(accepted, payerAddress, sp, controls);

  const unsignedBytesList = txns.map((t) => algosdk.encodeUnsignedTransaction(t));
  const signedResults = await signTxns(unsignedBytesList, signIndexes);

  const groupB64: string[] = [];
  for (let i = 0; i < unsignedBytesList.length; i++) {
    const signed = signedResults[i];
    if (signed) {
      groupB64.push(algosdk.bytesToBase64(signed));
    } else {
      groupB64.push(algosdk.bytesToBase64(unsignedBytesList[i]));
    }
  }

  return encodePaymentHeader(paymentRequired, accepted, groupB64, paymentIndex);
}

/**
 * Build an identity transaction for wallet ownership proof.
 *
 * Constructs an unsubmitted zero-amount payment transaction where sender and receiver
 * are the payer address, flat fee is 0, firstValid is 1, and lastValid is 1000.
 * The note field contains `x402-identity:<address>:<unix_timestamp>`.
 *
 * Because valid rounds are set to 1-1000 and fee is 0, this transaction cannot be executed
 * or replayed on chain; it serves purely as an off-chain cryptographic signature proof.
 *
 * @param address - Algorand address proving ownership.
 * @param genesisHashB64 - Network genesis hash as a base64-encoded string.
 * @param ts - Optional Unix timestamp in seconds (defaults to current time).
 * @returns Algorand Transaction instance ready for signing.
 *
 * @example
 * ```ts
 * const txn = buildIdentityTxn(activeAddress, MAINNET.genesisHash);
 * const signed = await signTransactions([algosdk.encodeUnsignedTransaction(txn)], [0]);
 * const header = encodeIdentityHeader(signed[0]!);
 * ```
 */
export function buildIdentityTxn(
  address: string,
  genesisHashB64: string,
  ts?: number
): algosdk.Transaction {
  const timestamp = ts ?? Math.floor(Date.now() / 1000);
  const note = new TextEncoder().encode(`x402-identity:${address}:${timestamp}`);
  const ghBytes = algosdk.base64ToBytes(genesisHashB64);

  const sp: algosdk.SuggestedParams = {
    fee: 0n,
    flatFee: true,
    firstValid: 1n,
    lastValid: 1000n,
    genesisHash: ghBytes,
    genesisID: '',
    minFee: 0n,
  };

  return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: address,
    receiver: address,
    amount: 0,
    suggestedParams: sp,
    note,
  });
}

/**
 * Encode signed identity transaction bytes to base64 string for the X-Identity-Txn header.
 *
 * Encodes the raw bytes of a signed identity transaction into a base64 string for transmission
 * in HTTP request headers (`X-Identity-Txn`).
 *
 * @param signedBytes - Signed transaction byte array.
 * @returns Base64-encoded string representation.
 *
 * @example
 * ```ts
 * const signedTxnBytes = account.signTransaction(identityTxn).blob;
 * const headerValue = encodeIdentityHeader(signedTxnBytes);
 * // Pass headerValue in 'X-Identity-Txn' header
 * ```
 */
export function encodeIdentityHeader(signedBytes: Uint8Array): string {
  return algosdk.bytesToBase64(signedBytes);
}
