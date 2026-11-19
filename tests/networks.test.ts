/**
 * The package on every Algorand network.
 *
 * Offline tests always run. PUBLIC_NETS=1 adds live checks against the real TestNet and MainNet through the
 * public AlgoNode endpoints. They never sign with a funded key and never submit: payments for real funded
 * accounts are only run through `simulate` with empty signatures, which moves no funds.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import algosdk from 'algosdk';
import {
  MAINNET,
  TESTNET,
  algodClient,
  decodePaymentRequired,
  networkFromGenesisHash,
  payForRequirement,
  resolveNetwork,
  selectRequirement,
  type AlgorandNetwork,
  type PaymentRequirements,
} from '../src/index.js';

const req = (network: string, extra: Record<string, any> = {}): PaymentRequirements => ({
  scheme: 'exact',
  network,
  asset: '0',
  amount: '10000',
  payTo: algosdk.generateAccount().addr.toString(),
  maxTimeoutSeconds: 300,
  extra,
});

describe('networks (offline)', () => {
  it('resolves names to CAIP-2 ids', () => {
    expect(resolveNetwork('mainnet')).toBe(MAINNET.caip2);
    expect(resolveNetwork('MainNet')).toBe(MAINNET.caip2);
    expect(resolveNetwork('algorand-testnet')).toBe(TESTNET.caip2);
    expect(resolveNetwork(TESTNET.caip2)).toBe(TESTNET.caip2);
    expect(resolveNetwork(MAINNET.caip2)).toBe(MAINNET.caip2);

    // Legacy long IDs resolve to canonical short CAIP-2 IDs
    expect(resolveNetwork('algorand:' + MAINNET.genesisHash)).toBe(MAINNET.caip2);
    expect(resolveNetwork('algorand:' + TESTNET.genesisHash)).toBe(TESTNET.caip2);
    expect(
      resolveNetwork('algorand:mFgazF+2uRS1tMiL9dsj01hJGySEmPN28B/TjjvpVW0=')
    ).toBe('algorand:mFgazF-2uRS1tMiL9dsj01hJGySEmPN2');

    // Canonical short CAIP-2 IDs pass through as is
    const shortCustom = 'algorand:mFgazF-2uRS1tMiL9dsj01hJGySEmPN2';
    expect(resolveNetwork(shortCustom)).toBe(shortCustom);
  });

  it('rejects unknown networks', () => {
    for (const bad of ['', 'ethereum', 'eip155:1', 'algorand:', 'algorand:short=']) {
      expect(() => resolveNetwork(bad)).toThrow();
    }
  });

  it('pays the offer for the wallet network, not the first one', () => {
    const offers = { x402Version: 2, accepts: [req(MAINNET.caip2), req(TESTNET.caip2)] };
    expect(selectRequirement(offers, 'testnet').network).toBe(TESTNET.caip2);
    expect(selectRequirement(offers, MAINNET.caip2).network).toBe(MAINNET.caip2);
    expect(() => selectRequirement({ accepts: [req(MAINNET.caip2)] }, 'testnet')).toThrow(/asks for payment on algorand:wGHE/);
  });

  it('matches offers listed with legacy long IDs', () => {
    const legacyTestnetOffer = req('algorand:' + TESTNET.genesisHash);
    const legacyMainnetOffer = req('algorand:' + MAINNET.genesisHash);
    const offers = { x402Version: 2, accepts: [legacyMainnetOffer, legacyTestnetOffer] };

    // Asking for testnet matches the legacy testnet offer
    expect(selectRequirement(offers, 'testnet').network).toBe('algorand:' + TESTNET.genesisHash);
    expect(selectRequirement(offers, TESTNET.caip2).network).toBe('algorand:' + TESTNET.genesisHash);

    // Asking via legacy ID matches short offer
    const modernOffers = { x402Version: 2, accepts: [req(TESTNET.caip2)] };
    expect(selectRequirement(modernOffers, 'algorand:' + TESTNET.genesisHash).network).toBe(TESTNET.caip2);
  });

  it('derives the network from a genesis hash using 32-character URL-safe base64', () => {
    // 3 spec vectors
    expect(networkFromGenesisHash(algosdk.base64ToBytes(MAINNET.genesisHash))).toBe('algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k');
    expect(networkFromGenesisHash(MAINNET.genesisHash)).toBe('algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k');
    expect(networkFromGenesisHash(TESTNET.genesisHash)).toBe('algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe');
    expect(
      networkFromGenesisHash('mFgazF+2uRS1tMiL9dsj01hJGySEmPN28B/TjjvpVW0=')
    ).toBe('algorand:mFgazF-2uRS1tMiL9dsj01hJGySEmPN2');
  });

  it('has default endpoints for MainNet and TestNet and needs a URL otherwise', () => {
    expect(algodClient('mainnet')).toBeInstanceOf(algosdk.Algodv2);
    expect(algodClient('localnet')).toBeInstanceOf(algosdk.Algodv2);
    expect(algodClient(MAINNET.caip2)).toBeInstanceOf(algosdk.Algodv2);
    expect(algodClient('algorand:' + MAINNET.genesisHash)).toBeInstanceOf(algosdk.Algodv2);
    expect(() => algodClient('algorand:mFgazF-2uRS1tMiL9dsj01hJGySEmPN2')).toThrow(/pass its algod URL/);
    expect(() => algodClient('algorand:' + 'A'.repeat(43) + '=')).toThrow(/pass its algod URL/);
  });

  it('does not use Node Buffer, so it runs in browsers, workers and edge runtimes', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/index.ts'), 'utf-8');
    expect(src).not.toMatch(/\bBuffer\b/);
    expect(decodePaymentRequired('eyJ4NDAyVmVyc2lvbiI6MiwiYWNjZXB0cyI6W119')).toEqual({ x402Version: 2, accepts: [] });
  });
});

const live = process.env.PUBLIC_NETS === '1' ? describe : describe.skip;

async function fundedUsdcHolders(net: AlgorandNetwork, algod: algosdk.Algodv2): Promise<string[]> {
  const r = await fetch(`${net.indexerUrl}/v2/assets/${net.usdc}/balances?currency-greater-than=5000000&limit=40`);
  const rows: { address: string }[] = (await r.json()).balances;
  const out: string[] = [];
  for (const row of rows) {
    const info = await algod.accountInformation(row.address).do();
    if (info.amount - info.minBalance > 2_000_000n && !info.authAddr) out.push(row.address);
    if (out.length === 3) return out;
  }
  throw new Error('not enough funded USDC holders found');
}

live.each([
  ['testnet', TESTNET],
  ['mainnet', MAINNET],
] as const)('live %s (read-only, simulate)', (name, net) => {
  const algod = algodClient(name);

  it('is the network the constants say', async () => {
    const sp = await algod.getTransactionParams().do();
    expect(networkFromGenesisHash(sp.genesisHash!)).toBe(net.caip2);
    expect(sp.genesisID).toBe(net.genesisId);
  });

  for (const asset of ['ALGO', 'USDC'] as const) {
    for (const withFeePayer of [true, false]) {
      it(`builds a ${asset} payment ${withFeePayer ? 'with' : 'without'} a fee payer that the network accepts`, async () => {
        const [payer, payTo, feePayer] = await fundedUsdcHolders(net, algod);
        const offer = {
          ...req(net.caip2, withFeePayer ? { feePayer } : {}),
          asset: asset === 'ALGO' ? '0' : String(net.usdc),
          payTo,
        };
        // a decoy offer for the other network comes first: the wallet must skip it
        const other = net === MAINNET ? TESTNET : MAINNET;
        const hdr = await payForRequirement({ x402Version: 2, accepts: [req(other.caip2), offer] }, payer, algod, async (t) => t.map(() => null));
        const p = JSON.parse(new TextDecoder().decode(algosdk.base64ToBytes(hdr)));
        expect(p.accepted.network).toBe(net.caip2);
        const txns = p.payload.paymentGroup.map(
          (b: string) => new algosdk.SignedTransaction({ txn: algosdk.decodeUnsignedTransaction(algosdk.base64ToBytes(b)) })
        );
        const sim = await algod
          .simulateTransactions(
            new algosdk.modelsv2.SimulateRequest({
              txnGroups: [new algosdk.modelsv2.SimulateRequestTransactionGroup({ txns })],
              allowEmptySignatures: true,
            })
          )
          .do();
        expect(sim.txnGroups[0].failureMessage ?? null).toBeNull();
      }, 60_000);
    }
  }
});
