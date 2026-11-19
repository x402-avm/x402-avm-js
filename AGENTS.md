# AGENTS.md

Guidance for AI coding agents and human contributors working on `x402-avm-js`.

## Project Overview

`x402-avm-js` is an Algorand Virtual Machine (AVM) payment library for TypeScript and JavaScript runtimes (browsers, Node.js, Cloudflare Workers, Deno, Bun). It implements client-side handling for the `exact` payment scheme defined by the x402 specification:
- Parses HTTP 402 `PAYMENT-REQUIRED` headers into structured requirements.
- Constructs atomic payment groups for native ALGO (asset 0) and Algorand Standard Assets (ASAs, including Circle USDC).
- Implements transaction fee abstraction via `feePayer` server accounts.
- Encodes signed payment transactions into standard `PAYMENT-SIGNATURE` headers.
- Generates 0-fee Ed25519 authentication transactions for `X-Identity-Txn` off-chain identity proofs.
- Resolves and normalizes network identifiers to canonical Algorand CAIP-2 profile IDs.
- Zero Node.js-specific dependencies (no `Buffer` in `src/`); operates in browser and edge environments using Web standard APIs.

## Environment Setup

Requires Node.js >= 18:

```bash
npm ci
```

## Running Tests

Tests are organized into three distinct tiers:

```bash
# 1. Offline unit tests (fast, no network or LocalNet required):
npm test
# Or specifically:
npx vitest run tests/unit.test.ts

# 2. LocalNet integration tests (requires AlgoKit LocalNet running on localhost:4001/4002):
LOCALNET=1 npx vitest run tests/golden.test.ts tests/golden_asa.test.ts

# 3. Public network simulation tests (read-only simulations against TestNet and MainNet):
PUBLIC_NETS=1 npx vitest run tests/networks.test.ts
```

Note: LocalNet tests require a Python 3.12 environment with `ai-economy-sdk` and `x402-algorand` available on PATH as `python3` (or configured via `PYTHON_PATH`).

## Code Style and Linting

```bash
# Type check without emitting artifacts:
npm run lint

# Compile TypeScript to dist/:
npm run build
```

## Repository Structure

```
.
├── .editorconfig               # Editor encoding and whitespace settings
├── .gitignore                  # Git ignore rules for node_modules and builds
├── .github/
│   ├── dependabot.yml          # Weekly dependency update schedule (npm, actions)
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI matrix and test workflow
├── src/                        # Library source code
│   ├── index.ts                # Main entry point and exports
│   ├── networks.ts             # CAIP-2 network resolvers and network constants
│   ├── payment.ts              # Payment parsing, transaction group construction, encoding
│   ├── identity.ts             # Off-chain Ed25519 identity transaction builder
│   └── types.ts                # TypeScript type definitions for x402 V2 structures
├── tests/                      # Vitest test suite
│   ├── fixtures/
│   │   ├── make_402.py         # Dynamic 402 fixture generator for tests
│   │   └── payment_required.b64 # Static offline sample fixture for unit tests
│   ├── helpers.ts              # LocalNet KMD dispenser, account funding, and ASA helpers
│   ├── unit.test.ts            # Offline unit tests
│   ├── golden.test.ts          # Live LocalNet ALGO payment verification and settlement
│   ├── golden_asa.test.ts      # Live LocalNet ASA (mUSD) payment and negative test cases
│   ├── networks.test.ts        # CAIP-2 resolution and public network simulations
│   └── py_verify.py            # Python Facilitator verification helper for golden tests
├── AGENTS.md                   # This agent guidance document
├── CHANGELOG.md                # Component release history
├── LICENSE                     # MIT License
├── README.md                   # Public documentation and quickstarts
├── package.json                # Package manifest, dependencies, and scripts
├── tsconfig.json               # TypeScript compiler options
└── vitest.config.ts            # Vitest runner configuration
```

## Conventions and Rules

1. **No Node-Only APIs in `src/`**: `src/` must remain compatible with browser and edge runtimes. Never import or use Node.js `Buffer`, `fs`, `path`, or `child_process` in `src/`. Use `Uint8Array`, `TextEncoder`, `TextDecoder`, and standard base64 conversions.
2. **Self-Contained Tests**: Tests must never rely on local machine paths, user directories, or private configuration files. LocalNet tests must create dynamic test accounts and fund them via KMD (`http://localhost:4002`).
3. **Network Identifiers**: Use canonical 32-character CAIP-2 IDs:
   - MainNet: `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k`
   - TestNet: `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe`
   - LocalNet: `algorand:<genesis-hash>` (derived from algod `suggestedParams().genesisHash`)
   Accept legacy 44-character base64 IDs and normalize them via `resolveNetwork()`.
4. **Units and Currencies**: Amounts are always expressed in base integer units (microALGO or base ASA units) as strings in payment headers and `bigint` in internal calculations.
5. **No Secrets**: Never commit private keys, mnemonics, or production tokens.
6. **Integrity of Assertions**: Never weaken tests or reduce assertion checks to make a suite pass. Preserve exact balance checks.

## Pull Request Checklist

Before opening a pull request, ensure:
- [ ] `npm run lint` passes without TypeScript errors.
- [ ] `npm test` passes all offline unit tests.
- [ ] `PUBLIC_NETS=1 npx vitest run tests/networks.test.ts` passes.
- [ ] `LOCALNET=1 npx vitest run tests/golden.test.ts tests/golden_asa.test.ts` passes against LocalNet.
- [ ] `npm run build` cleanly produces `dist/`.
- [ ] Grep audit for private local paths and usernames returns nothing.
- [ ] `CHANGELOG.md` is updated with your changes.
