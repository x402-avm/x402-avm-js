# Changelog

All notable changes to `x402-avm-js` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1] - 2026-11-19

### Fixed
- `algodClient('localnet')` connected to port 80 instead of 4001: the empty-string port passed to `algosdk.Algodv2` made algosdk 3.x override the port in the URL. The port is now omitted so the URL's own port (or the scheme default for MainNet and TestNet) is used. Affected every release since the first.

## [0.4.0] - 2026-11-19

### Breaking
- **Default spend cap.** `payForRequirement` and `buildExactAvmGroup` now refuse any payment above 1,000,000 base units (1 ALGO, or 1 USDC) with a `SpendLimitExceededError`, before anything is signed. This matches the Python x402 client default. To pay more, pass the new options argument, for example `payForRequirement(challenge, address, algod, signer, { maxAmount: 5_000_000n })`; `maxAmount: Infinity` removes the cap.
- Node.js 18 is no longer supported; the package requires Node.js >= 20 and CI tests 20, 22 and 24.
- Types: `extra` and `extensions` values are now `unknown` instead of `any`, and `selectRequirement`, `encodePaymentHeader` and `payForRequirement` take `PaymentRequired` instead of `PaymentRequired | any`. Use `decodePaymentRequired` or `parsePaymentRequired` to turn untrusted JSON into a `PaymentRequired`.
- `decodePaymentRequired` now validates the decoded shape and throws `InvalidPaymentRequiredError` (previously it returned whatever JSON it found).

### Added
- Spend controls: `maxAmount` (per payment, or per asset), `allowedAssets`, `allowedNetworks`, `allowedPayTo`; exported `SpendControls`, `DEFAULT_MAX_AMOUNT`, `checkSpendControls`.
- Typed errors, all extending `X402AvmError` with a stable `code`: `SpendLimitExceededError`, `PaymentNotAllowedError`, `InvalidPaymentRequiredError`, `NoSupportedRequirementError`, `NetworkMismatchError`, `UnknownNetworkError`, `InvalidOptionsError`.
- `parsePaymentRequired(value: unknown)` for validating untrusted input.
- `buildExactAvmGroup` rejects requirements whose `extra.genesisHash` or `extra.genesisId` disagrees with the algod parameters, and malformed `payTo`, `feePayer`, `amount` and `asset` values.
- Offline test suite grown from 8 to 49 tests, with a coverage report and thresholds in CI.
- Release workflow (`release.yml`), disabled until an `NPM_TOKEN` secret is configured; publishes with npm provenance.

### Changed
- `src/` is now published in the package so source maps and go-to-definition resolve.
- Author is "x402-avm contributors"; the LICENSE copyright line is updated to match.

### Security
- Client-side spend limits (see Breaking) protect against a server requesting an unexpectedly large amount.

## [0.3.1] - 2026-11-19

### Added
- Repository and package metadata: repository, homepage, bugs URL, keywords, and author.
- Self-contained LocalNet golden test suite with dynamic KMD dispenser funding and dynamic ASA lifecycle testing.
- Documentation and repository standards: README.md, AGENTS.md, .gitignore, and .editorconfig.
- Dependabot configuration grouping minor/patch updates and pinning vitest to 3.x for Node 18/20 runtime compatibility.

### Changed
- Updated devDependencies: upgraded TypeScript to 7.0.2.
- Hardened timestamp generator `getNs()` to safely access `globalThis.process` across browser, edge, and Node.js environments.

## [0.3.0] - 2026-11-18

### Added
- Standard CAIP-2 short network IDs (`algorand:<32-chars>`) support with seamless fallback for legacy 44-character IDs.
- Full compatibility with the official `x402` 2.28 protocol and `x402_algorand` plugin architecture.
- Support for both native ALGO (asset 0) and Algorand Standard Assets (ASAs, including Circle USDC).
- Transaction fee abstraction via `feePayer` 2-transaction atomic groups.
- Off-chain Ed25519 authentication proof generation with `buildIdentityTxn` and `encodeIdentityHeader` (`X-Identity-Txn`).
- Self-contained test suite with dynamic LocalNet funding from KMD dispenser and dynamic ASA lifecycle testing.

## [0.2.1] - 2026-11-18

### Fixed
- Included missing `LICENSE` (MIT) in the published npm package files list.

## [0.2.0] - 2026-11-18

### Added
- Zero Node.js `Buffer` dependency: runs in browsers, workers, and edge runtimes without polyfills.
- Network presets and helpers: `MAINNET`, `TESTNET`, `LOCALNET_ENDPOINTS`, `resolveNetwork`, `networkFromAlgod`, `networkFromGenesisHash`, `algodClient`, and `selectRequirement`.
- `payForRequirement` verifies network match between algod client and server requirements, throwing when no compatible network offer is available.
- Public network simulation test suite (`tests/networks.test.ts`) supporting read-only `PUBLIC_NETS=1` testing on MainNet and TestNet.
- Published package manifest with `exports` map, types, and automated `prepublishOnly` build and test validation.

## [0.1.0] - 2026-11-17

### Added
- Initial implementation of Algorand AVM exact-scheme client for x402 payment protocol.
- Support for parsing `PAYMENT-REQUIRED` headers and constructing unsigned Algorand transaction groups.
- Wallet signing integration and base64 `PAYMENT-SIGNATURE` header encoding.
