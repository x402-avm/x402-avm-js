# x402-avm-js

x402 payments on Algorand (AVM) for browsers and Node.js.

[![CI](https://github.com/x402-avm/x402-avm-js/actions/workflows/ci.yml/badge.svg)](https://github.com/x402-avm/x402-avm-js/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/x402-avm-js)](https://www.npmjs.com/package/x402-avm-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

`x402-avm-js` enables web applications, agents, and client libraries to pay for x402-protected HTTP and Model Context Protocol (MCP) endpoints using Algorand. It parses HTTP 402 PAYMENT-REQUIRED challenge headers, constructs atomic transaction groups with fee abstraction, coordinates wallet signatures, and encodes standards-compliant `PAYMENT-SIGNATURE` headers. The library has zero Node.js-only dependencies and runs seamlessly across modern browsers, workers, edge runtimes, and Node.js.

> Not affiliated with GoPlausible's `x402-avm` npm package. This package implements the client side of the
> [exact scheme for AVM](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_algo.md).

## Installation

```bash
npm install x402-avm-js algosdk
```

## Quickstart

### Browser (Wallet Provider / ARC-0027)

```ts
import { algodClient, decodePaymentRequired, payForRequirement } from 'x402-avm-js';

// Initialize algod client for target network
const algod = algodClient('mainnet');

// Make request to x402 protected resource
const response = await fetch('https://api.example.com/paid-endpoint');

if (response.status === 402) {
  // Decode 402 Payment Required challenge
  const challengeHeader = response.headers.get('PAYMENT-REQUIRED')!;
  const requirements = decodePaymentRequired(challengeHeader);

  // Sign and construct payment header using browser wallet provider
  const paymentHeader = await payForRequirement(
    requirements,
    userAddress,
    algod,
    async (unsignedTxnBytes, indexesToSign) => {
      // Connects to any standard ARC-0027 / wallet signer (e.g. Pera, Defly, Lute)
      return wallet.signTransactions(unsignedTxnBytes, indexesToSign);
    }
  );

  // Retry request with authorization payment header
  const paidResponse = await fetch('https://api.example.com/paid-endpoint', {
    headers: { 'PAYMENT-SIGNATURE': paymentHeader },
  });
  console.log(await paidResponse.json());
}
```

### Node.js (Local Signer / Secret Key)

```ts
import algosdk from 'algosdk';
import { algodClient, decodePaymentRequired, payForRequirement } from 'x402-avm-js';

const account = algosdk.mnemonicToSecretKey(process.env.ALGORAND_MNEMONIC!);
const algod = algodClient('testnet');

const response = await fetch('https://testnet-api.example.com/service');
if (response.status === 402) {
  const challenge = decodePaymentRequired(response.headers.get('PAYMENT-REQUIRED')!);

  const paymentHeader = await payForRequirement(
    challenge,
    account.addr.toString(),
    algod,
    async (txns, indexes) => {
      return txns.map((bytes, idx) => {
        if (indexes.includes(idx)) {
          return algosdk.decodeUnsignedTransaction(bytes).signTxn(account.sk);
        }
        return null;
      });
    }
  );

  const res = await fetch('https://testnet-api.example.com/service', {
    headers: { 'PAYMENT-SIGNATURE': paymentHeader },
  });
  console.log(await res.json());
}
```

## Spend controls (security)

The server chooses the amount in a 402 challenge, so a compromised or buggy server could ask for any amount. `payForRequirement` and `buildExactAvmGroup` check every requirement against spend controls **before anything is built or signed**.

**By default, payments above 1,000,000 base units (1 ALGO, or 1 USDC) are refused** with a `SpendLimitExceededError`. This matches the default of the Python x402 client. To pay more, raise the cap explicitly:

```ts
const header = await payForRequirement(challenge, address, algod, signer, {
  maxAmount: 5_000_000n,                       // bigint, number or numeric string; base units
  allowedAssets: [0, 31566704],                // ALGO and MainNet USDC
  allowedNetworks: ['mainnet'],                // names or CAIP-2 ids
  allowedPayTo: ['VENDOR_ADDRESS'],            // recipients you trust
});
```

| Option | Meaning |
|---|---|
| `maxAmount` | Per-payment cap in base units. A single value applies to every asset; a record such as `{ '0': 2_000_000, '31566704': 5_000_000, '*': 100_000 }` sets it per asset id, with `'*'` as fallback. Unlisted assets use the 1,000,000 default. `Infinity` removes the cap. |
| `allowedAssets` | If set, only these asset ids (`0` is ALGO). |
| `allowedNetworks` | If set, only these networks. |
| `allowedPayTo` | If set, only these recipient addresses. |

`checkSpendControls(requirement, controls)` runs the same check on its own.

## Errors

All errors extend `X402AvmError` and carry a stable `code`.

| Class | `code` | Thrown when |
|---|---|---|
| `SpendLimitExceededError` | `spend_limit_exceeded` | Amount is above the cap (`asset`, `amount`, `limit` properties). |
| `PaymentNotAllowedError` | `payment_not_allowed` | Asset, network or recipient is not on an allow list (`field`, `value`). |
| `InvalidPaymentRequiredError` | `invalid_payment_required` | The PAYMENT-REQUIRED header or a requirement is malformed. |
| `NoSupportedRequirementError` | `no_supported_requirement` | The challenge has no `accepts` entries. |
| `NetworkMismatchError` | `network_mismatch` | No offer is for the wallet's network, or a requirement's genesis differs from algod's. |
| `UnknownNetworkError` | `unknown_network` | A network name or CAIP-2 id is not recognised. |
| `InvalidOptionsError` | `invalid_options` | A spend control is malformed. |

```ts
import { SpendLimitExceededError } from 'x402-avm-js';

try {
  await payForRequirement(challenge, address, algod, signer);
} catch (e) {
  if (e instanceof SpendLimitExceededError) console.warn(`Server asked for ${e.amount}, limit is ${e.limit}`);
  else throw e;
}
```

Errors raised by algod or by your `signTxns` callback propagate unchanged. This library does not make HTTP requests, so it has no settlement or facilitator errors.

## Off-Chain Identity Verification

Prove account ownership to an x402 server without moving funds or incurring network transaction fees:

```ts
import { buildIdentityTxn, encodeIdentityHeader, MAINNET } from 'x402-avm-js';

// Build 0-fee zero-movement identity transaction locked to network genesis hash
const identityTxn = buildIdentityTxn(account.addr.toString(), MAINNET.genesisHash);
const signedBytes = identityTxn.signTxn(account.sk);

const identityHeader = encodeIdentityHeader(signedBytes);

// Send in X-Identity-Txn header for instant Ed25519 authentication
const authResponse = await fetch('https://api.example.com/auth-resource', {
  headers: { 'X-Identity-Txn': identityHeader },
});
```

## Supported Networks

The package conforms to the canonical Algorand CAIP-2 profile specification:

| Network | Canonical CAIP-2 ID | Default Algod Endpoint | USDC Asset ID |
|---|---|---|---|
| MainNet | `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k` | `https://mainnet-api.algonode.cloud` | `31566704` |
| TestNet | `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe` | `https://testnet-api.algonode.cloud` | `10458941` |
| LocalNet | `algorand:<genesis-hash>` | `http://localhost:4001` | Dynamic |

Legacy 44-character base64 network strings are automatically normalized to canonical short CAIP-2 identifiers.

## Requirements

- Node.js >= 20 or modern evergreen browser
- `algosdk` >= 3.9.0

## Links

- Documentation: [https://x402-avm.github.io](https://x402-avm.github.io)
- Examples: [https://github.com/x402-avm/examples](https://github.com/x402-avm/examples)
- Exact-AVM scheme specification: [scheme_exact_algo.md](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_algo.md)
- Python SDK: [ai-economy-sdk](https://github.com/x402-avm/ai-economy-sdk)
- x402 Python Plugin: [x402-algorand](https://github.com/x402-avm/x402-algorand)

## Development

```bash
# Type check and lint
npm run lint

# Run offline tests
npm test

# Offline tests with coverage thresholds
npm run test:coverage

# Run read-only simulations on public networks (TestNet and MainNet)
PUBLIC_NETS=1 npm test

# Run live integration tests against a running AlgoKit LocalNet
LOCALNET=1 npm test

# Build distribution bundle
npm run build
```

## License

MIT. See [LICENSE](LICENSE).
