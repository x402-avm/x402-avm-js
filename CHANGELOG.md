# Changelog

All notable changes to `x402-avm-js` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
