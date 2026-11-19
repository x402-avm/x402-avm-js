import algosdk from 'algosdk';

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
    [key: string]: any;
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
  extensions?: Record<string, any> | null;
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
 * @throws {Error} If the network name or CAIP-2 string is unrecognized.
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
  throw new Error(`Unknown network "${network}": use "mainnet", "testnet" or "algorand:<genesis hash>" (for LocalNet, networkFromAlgod(algod))`);
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
 * @throws {Error} If the algod node is unreachable or does not return a genesisHash.
 *
 * @example
 * ```ts
 * const algod = algodClient('localnet');
 * const networkId = await networkFromAlgod(algod);
 * console.log(networkId); // 'algorand:...'
 * ```
 */
export async function networkFromAlgod(algod: algosdk.Algodv2): Promise<string> {
  const sp = await algod.getTransactionParams().do();
  return networkFromGenesisHash(sp.genesisHash!);
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
 * @throws {Error} If network has no default endpoint and url is omitted.
 *
 * @example
 * ```ts
 * const client = algodClient('testnet');
 * const localClient = algodClient('localnet');
 * ```
 */
export function algodClient(network: string, url?: string, token?: string): algosdk.Algodv2 {
  if (network.toLowerCase() === 'localnet') {
    return new algosdk.Algodv2(token ?? LOCALNET_ENDPOINTS.algodToken, url ?? LOCALNET_ENDPOINTS.algodUrl, '');
  }
  const known = ALIASES[network] ?? ALIASES[network.toLowerCase()];
  if (!known && !url) throw new Error(`No default endpoint for network "${network}": pass its algod URL`);
  return new algosdk.Algodv2(token ?? '', url ?? known!.algodUrl, '');
}

/**
 * Select the first acceptable payment requirement matching the payer's network.
 *
 * Searches the `accepts` array of a PaymentRequired challenge for an offer using the "exact"
 * payment scheme matching the specified network (resolved via `resolveNetwork`).
 *
 * @param paymentRequired - Parsed PaymentRequired object or object with `accepts` array.
 * @param network - Desired network name, alias, or CAIP-2 identifier.
 * @returns The matching PaymentRequirements entry.
 * @throws {Error} If `accepts` is empty or no requirement matches the requested network.
 *
 * @example
 * ```ts
 * const req = selectRequirement(paymentRequired, 'mainnet');
 * console.log(`Pay ${req.amount} microALGO to ${req.payTo}`);
 * ```
 */
export function selectRequirement(paymentRequired: PaymentRequired | any, network: string): PaymentRequirements {
  const accepts: PaymentRequirements[] = paymentRequired?.accepts ?? [];
  if (!accepts.length) {
    throw new Error('No accepted payment requirements found in paymentRequired');
  }
  const want = resolveNetwork(network);
  const match = accepts.find((a) => a.scheme === 'exact' && safeResolve(a.network) === want);
  if (!match) {
    const offered = [...new Set(accepts.map((a) => a.network))].join(', ');
    throw new Error(`The server asks for payment on ${offered}, but this wallet is on ${want}`);
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
  const p = (globalThis as any).process;
  if (p && p.hrtime && typeof p.hrtime.bigint === 'function') {
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
 * @throws {Error} If decoding or JSON parsing fails.
 *
 * @example
 * ```ts
 * const header = response.headers.get('PAYMENT-REQUIRED');
 * const challenge = decodePaymentRequired(header);
 * console.log(challenge.x402Version); // 2
 * ```
 */
export function decodePaymentRequired(headerB64: string): PaymentRequired {
  return JSON.parse(new TextDecoder().decode(algosdk.base64ToBytes(headerB64.trim())));
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
 * @returns Object containing the transaction group, payment transaction index, and indexes requiring signature.
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
  suggestedParams: algosdk.SuggestedParams
): BuildGroupResult {
  const extra = req.extra || {};
  const feePayer = extra.feePayer;

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

  const assetId = Number(req.asset);
  const amount = BigInt(req.amount);

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
  paymentRequired: PaymentRequired | any,
  accepted: PaymentRequirements,
  groupB64: string[],
  paymentIndex: number
): string {
  const payloadObj: Record<string, any> = {
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
 * @returns Promise resolving to the base64-encoded `PAYMENT-SIGNATURE` header string.
 * @throws {Error} If parameter fetching fails, requirement matching fails, or signing is rejected.
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
  paymentRequired: PaymentRequired | any,
  payerAddress: string,
  algod: algosdk.Algodv2,
  signTxns: (txns: Uint8Array[], indexes: number[]) => Promise<(Uint8Array | null)[]>
): Promise<string> {
  const sp = await algod.getTransactionParams().do();
  // Pay only an offer for the network this algod is on: a payment signed for another network is useless,
  // and choosing by network lets one server offer several (e.g. MainNet USDC and TestNet ALGO).
  const accepted = selectRequirement(paymentRequired, networkFromGenesisHash(sp.genesisHash));
  const { txns, paymentIndex, signIndexes } = buildExactAvmGroup(accepted, payerAddress, sp);

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
