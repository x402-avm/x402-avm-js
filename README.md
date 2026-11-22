# x402-avm-js

[![CI](https://github.com/x402-avm/x402-avm-js/actions/workflows/ci.yml/badge.svg)](https://github.com/x402-avm/x402-avm-js/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/x402-avm-js)](https://www.npmjs.com/package/x402-avm-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Pay for x402 APIs and AI tools from a browser wallet or Node.js, on Algorand.**

When a server answers `402 Payment Required`, this library reads the price and checks it against your spend limits. It then builds the Algorand payment and has your wallet sign it, giving you the header to retry with. It works with Pera, Defly, Lute or any wallet that can sign transactions, and with a plain key in Node.js. It runs anywhere `fetch` does: browsers, Node.js 20+, workers and edge runtimes.

Part of [x402-avm](https://github.com/x402-avm/x402-avm). Implements the client side of the official [exact scheme on Algorand](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_algo.md). **[Documentation](https://x402-avm.github.io/build/pay-from-browser)**

```bash
npm install x402-avm-js algosdk
```

## Pay from the browser

```ts
import { algodClient, decodePaymentRequired, payForRequirement } from 'x402-avm-js';

const url = 'https://api.example.com/paid-endpoint';
const res = await fetch(url);

if (res.status === 402) {
  const required = decodePaymentRequired(res.headers.get('PAYMENT-REQUIRED')!);
  const payment = await payForRequirement(
    required,
    userAddress,
    algodClient('mainnet'),
    (txns, indexesToSign) => wallet.signTransactions(txns, indexesToSign),
  );
  const paid = await fetch(url, { headers: { 'PAYMENT-SIGNATURE': payment } });
  console.log(await paid.json());
}
```

When the server pays the network fee, as x402-avm servers always do, the user's balance goes down by exactly the price.

## Spend limits are on by default

The server picks the amount in a 402, so a buggy or hostile server could ask for anything. Every payment is checked before anything is built or signed. **Anything above 1 ALGO or 1 USDC is refused by default** with `SpendLimitExceededError`. Set your own limits:

```ts
await payForRequirement(required, address, algod, signer, {
  maxAmount: 5_000_000n,              // base units: 5 ALGO or 5 USDC
  allowedAssets: [0, 31566704],       // ALGO and MainNet USDC
  allowedNetworks: ['mainnet'],
  allowedPayTo: ['VENDOR_ADDRESS'],   // only pay recipients you trust
});
```

## Pay from Node.js

Use a key instead of a wallet:

```ts
import algosdk from 'algosdk';

const account = algosdk.mnemonicToSecretKey(process.env.ALGORAND_MNEMONIC!);
const sign = async (txns: Uint8Array[], indexes: number[]) =>
  txns.map((bytes, i) =>
    indexes.includes(i) ? algosdk.decodeUnsignedTransaction(bytes).signTxn(account.sk) : null);

const payment = await payForRequirement(required, account.addr.toString(), algodClient('testnet'), sign);
```

## Also included

- **Every network:** MainNet, TestNet, LocalNet and private networks by name or [CAIP-2](https://x402-avm.github.io/production/networks) id, with public AlgoNode endpoints built in.
- **Identity proofs:** prove you own an address without moving funds (`buildIdentityTxn`, `encodeIdentityHeader`). → [Identity](https://x402-avm.github.io/build/identity)
- **Typed errors:** every error extends `X402AvmError` and has a stable `code`. → [Errors](https://x402-avm.github.io/reference/errors)
- **TypeScript types** for the whole x402 payload, and no dependencies that only work in Node.js.

The full API is in the [reference](https://x402-avm.github.io/reference/js/index). To sell tools or APIs from Python, use [`ai-economy-sdk`](https://github.com/x402-avm/ai-economy-sdk) or [`x402-algorand`](https://github.com/x402-avm/x402-algorand). Requires `algosdk` 3.9 or later.

## Development

```bash
npm ci
npm run lint && npm test     # type check, lint and offline tests
npm run test:coverage
LOCALNET=1 npm test          # also against AlgoKit LocalNet (algokit localnet start)
npm run build
```

See [CONTRIBUTING](https://github.com/x402-avm/.github/blob/main/CONTRIBUTING.md). Report security problems privately, following the [security policy](https://github.com/x402-avm/.github/blob/main/SECURITY.md).

## Licence

MIT. See [LICENSE](LICENSE). x402-avm is not affiliated with GoPlausible's `x402-avm` npm package.
