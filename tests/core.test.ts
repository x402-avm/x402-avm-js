import { describe, it, expect } from 'vitest';
import algosdk from 'algosdk';
import {
  MAINNET,
  TESTNET,
  LOCALNET_ENDPOINTS,
  InvalidPaymentRequiredError,
  NetworkMismatchError,
  NoSupportedRequirementError,
  UnknownNetworkError,
  X402AvmError,
  algodClient,
  buildExactAvmGroup,
  decodePaymentRequired,
  encodePaymentHeader,
  networkFromAlgod,
  networkFromGenesisHash,
  parsePaymentRequired,
  payForRequirement,
  resolveNetwork,
  selectRequirement,
  type PaymentRequired,
  type PaymentRequirements,
} from '../src/index.js';

const b64 = (o: unknown) => algosdk.bytesToBase64(new TextEncoder().encode(JSON.stringify(o)));
const payTo = algosdk.generateAccount().addr.toString();
const feePayer = algosdk.generateAccount().addr.toString();
const payerAcc = algosdk.generateAccount();
const payer = payerAcc.addr.toString();

const offer = (over: Partial<PaymentRequirements> = {}): PaymentRequirements => ({
  scheme: 'exact',
  network: TESTNET.caip2,
  asset: '0',
  amount: '5000',
  payTo,
  maxTimeoutSeconds: 300,
  ...over,
});
const challenge = (...accepts: PaymentRequirements[]): PaymentRequired => ({ x402Version: 2, accepts });

const tnParams = (): algosdk.SuggestedParams => ({
  fee: 1000n,
  minFee: 1000n,
  firstValid: 500n,
  lastValid: 1500n,
  genesisHash: algosdk.base64ToBytes(TESTNET.genesisHash),
  genesisID: 'testnet-v1.0',
  flatFee: true,
});

describe('header decode and validation', () => {
  it('round-trips a challenge', () => {
    const c = challenge(offer());
    expect(decodePaymentRequired(b64(c))).toEqual(c);
    expect(decodePaymentRequired('  ' + b64(c) + '\n')).toEqual(c);
  });

  it('rejects garbage with InvalidPaymentRequiredError', () => {
    expect(() => decodePaymentRequired('!!!not base64')).toThrow(InvalidPaymentRequiredError);
    expect(() => decodePaymentRequired(algosdk.bytesToBase64(new TextEncoder().encode('{nope')))).toThrow(InvalidPaymentRequiredError);
  });

  it('rejects wrong shapes', () => {
    const bad: unknown[] = [
      null,
      [],
      'x',
      {},
      { x402Version: '2', accepts: [] },
      { x402Version: 2 },
      { x402Version: 2, accepts: ['x'] },
      { x402Version: 2, accepts: [{ ...offer(), payTo: 5 }] },
      { x402Version: 2, accepts: [{ ...offer(), amount: '1.5' }] },
      { x402Version: 2, accepts: [{ ...offer(), amount: '-1' }] },
      { x402Version: 2, accepts: [{ ...offer(), asset: 'usdc' }] },
      { x402Version: 2, accepts: [{ ...offer(), maxTimeoutSeconds: '300' }] },
      { x402Version: 2, accepts: [{ ...offer(), extra: 'x' }] },
    ];
    for (const b of bad) {
      expect(() => parsePaymentRequired(b)).toThrow(InvalidPaymentRequiredError);
      expect(() => decodePaymentRequired(b64(b))).toThrow(InvalidPaymentRequiredError);
    }
  });

  it('error type hierarchy', () => {
    try {
      parsePaymentRequired(null);
    } catch (e) {
      expect(e).toBeInstanceOf(X402AvmError);
      expect((e as X402AvmError).code).toBe('invalid_payment_required');
      expect((e as Error).name).toBe('InvalidPaymentRequiredError');
    }
  });
});

describe('encodePaymentHeader', () => {
  it('omits resource and extensions when absent', () => {
    const c = challenge(offer());
    const h = JSON.parse(new TextDecoder().decode(algosdk.base64ToBytes(encodePaymentHeader(c, c.accepts[0], ['AA=='], 0))));
    expect(h).toEqual({ x402Version: 2, accepted: c.accepts[0], payload: { paymentGroup: ['AA=='], paymentIndex: 0 } });
  });
});

describe('selectRequirement', () => {
  it('picks the first exact offer on the wanted network', () => {
    const a = offer({ network: MAINNET.caip2, amount: '1' });
    const b = offer({ amount: '2' });
    const c = offer({ amount: '3' });
    expect(selectRequirement(challenge(a, b, c), 'testnet')).toBe(b);
    expect(selectRequirement(challenge(a, b, c), 'mainnet')).toBe(a);
  });

  it('matches legacy long ids and skips non-exact schemes and unparseable networks', () => {
    const legacy = offer({ network: 'algorand:' + TESTNET.genesisHash });
    expect(selectRequirement(challenge(offer({ scheme: 'upto' }), offer({ network: 'eip155:1' }), legacy), TESTNET.caip2)).toBe(legacy);
  });

  it('throws typed errors', () => {
    expect(() => selectRequirement(challenge(), 'testnet')).toThrow(NoSupportedRequirementError);
    try {
      selectRequirement(challenge(offer({ network: MAINNET.caip2 })), 'testnet');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(NetworkMismatchError);
      expect((e as NetworkMismatchError).offered).toEqual([MAINNET.caip2]);
      expect((e as NetworkMismatchError).expected).toBe(TESTNET.caip2);
      expect((e as Error).message).toMatch(/asks for payment on algorand:wGHE/);
    }
    expect(() => selectRequirement(challenge(offer({ scheme: 'upto' })), 'testnet')).toThrow(NetworkMismatchError);
  });
});

describe('CAIP-2 network parsing', () => {
  it('derives ids from genesis hashes (string and bytes)', () => {
    expect(networkFromGenesisHash(MAINNET.genesisHash)).toBe(MAINNET.caip2);
    expect(networkFromGenesisHash(algosdk.base64ToBytes(TESTNET.genesisHash))).toBe(TESTNET.caip2);
    expect(MAINNET.caip2).toHaveLength('algorand:'.length + 32);
  });

  it('resolves aliases case-insensitively', () => {
    for (const n of ['mainnet', 'MAINNET', 'algorand-mainnet', 'algorand']) expect(resolveNetwork(n)).toBe(MAINNET.caip2);
    for (const n of ['testnet', 'Algorand-TestNet']) expect(resolveNetwork(n)).toBe(TESTNET.caip2);
  });

  it('accepts a short id for an unknown (e.g. LocalNet) genesis and normalises legacy ids', () => {
    const gh = new Uint8Array(32).fill(9);
    const short = networkFromGenesisHash(gh);
    expect(resolveNetwork(short)).toBe(short);
    expect(resolveNetwork('algorand:' + algosdk.bytesToBase64(gh))).toBe(short);
  });

  it('throws UnknownNetworkError with the offending value', () => {
    for (const bad of ['', 'ethereum', 'eip155:1', 'algorand:', 'algorand:has space', 'algorand:' + 'A'.repeat(33)]) {
      expect(() => resolveNetwork(bad)).toThrow(UnknownNetworkError);
    }
    try {
      resolveNetwork('ethereum');
    } catch (e) {
      expect((e as UnknownNetworkError).network).toBe('ethereum');
      expect((e as UnknownNetworkError).code).toBe('unknown_network');
    }
  });

  it('algodClient builds clients and rejects unknown networks without a URL', () => {
    expect(algodClient('mainnet')).toBeInstanceOf(algosdk.Algodv2);
    expect(algodClient('localnet')).toBeInstanceOf(algosdk.Algodv2);
    expect(algodClient('localnet', 'http://localhost:5000', 'tok')).toBeInstanceOf(algosdk.Algodv2);
    expect(algodClient('algorand:mFgazF-2uRS1tMiL9dsj01hJGySEmPN2', 'http://10.0.0.1:4001')).toBeInstanceOf(algosdk.Algodv2);
    expect(() => algodClient('algorand:mFgazF-2uRS1tMiL9dsj01hJGySEmPN2')).toThrow(UnknownNetworkError);
    expect(LOCALNET_ENDPOINTS.algodUrl).toBe('http://localhost:4001');
  });

  it('networkFromAlgod reads the genesis hash from algod', async () => {
    const fake = (sp: unknown) => ({ getTransactionParams: () => ({ do: async () => sp }) }) as unknown as algosdk.Algodv2;
    expect(await networkFromAlgod(fake(tnParams()))).toBe(TESTNET.caip2);
    await expect(networkFromAlgod(fake({}))).rejects.toBeInstanceOf(X402AvmError);
  });
});

describe('buildExactAvmGroup group construction', () => {
  it('fee-payer group: decoded unsigned txns match the spec layout', () => {
    const { txns, paymentIndex, signIndexes } = buildExactAvmGroup(offer({ asset: '31566704', amount: '12345', extra: { feePayer } }), payer, tnParams());
    expect(paymentIndex).toBe(1);
    expect(signIndexes).toEqual([1]);

    // Round trip through the wire encoding the wallet receives
    const decoded = txns.map((t) => algosdk.decodeUnsignedTransaction(algosdk.encodeUnsignedTransaction(t)));
    const [fee, pay] = decoded;

    expect(fee.sender.toString()).toBe(feePayer);
    expect(fee.type).toBe(algosdk.TransactionType.pay);
    expect(fee.payment?.receiver.toString()).toBe(feePayer);
    expect(fee.payment?.amount).toBe(0n);
    expect(fee.fee).toBe(2000n);

    expect(pay.type).toBe(algosdk.TransactionType.axfer);
    expect(pay.sender.toString()).toBe(payer);
    expect(pay.assetTransfer?.receiver.toString()).toBe(payTo);
    expect(pay.assetTransfer?.assetIndex).toBe(31566704n);
    expect(pay.assetTransfer?.amount).toBe(12345n);
    expect(pay.fee).toBe(0n);

    // Same group id on both, matching the id computed from the ungrouped txns
    expect(fee.group).toBeDefined();
    expect(algosdk.bytesToBase64(fee.group!)).toBe(algosdk.bytesToBase64(pay.group!));
    const ungrouped = decoded.map((t) => {
      const u = algosdk.decodeUnsignedTransaction(algosdk.encodeUnsignedTransaction(t));
      u.group = undefined;
      return u;
    });
    expect(algosdk.bytesToBase64(algosdk.computeGroupID(ungrouped))).toBe(algosdk.bytesToBase64(fee.group!));

    // Validity window and genesis are copied from suggested params
    for (const t of decoded) {
      expect(t.firstValid).toBe(500n);
      expect(t.lastValid).toBe(1500n);
      expect(t.genesisID).toBe('testnet-v1.0');
      expect(algosdk.bytesToBase64(t.genesisHash)).toBe(TESTNET.genesisHash);
    }
  });

  it('uses minFee from suggested params for the pooled fee', () => {
    const sp = { ...tnParams(), minFee: 2500n };
    const { txns } = buildExactAvmGroup(offer({ extra: { feePayer } }), payer, sp);
    expect(txns[0].fee).toBe(5000n);
    const { txns: t2 } = buildExactAvmGroup(offer({ extra: { feePayer } }), payer, { ...tnParams(), minFee: undefined });
    expect(t2[0].fee).toBe(2000n);
  });

  it('single txn when there is no fee payer: payer pays the fee, no group id', () => {
    const { txns, paymentIndex, signIndexes } = buildExactAvmGroup(offer(), payer, tnParams());
    expect(txns).toHaveLength(1);
    expect(paymentIndex).toBe(0);
    expect(signIndexes).toEqual([0]);
    expect(txns[0].group).toBeUndefined();
    expect(txns[0].fee).toBe(1000n);
  });

  it('unique notes per build', () => {
    const a = buildExactAvmGroup(offer(), payer, tnParams()).txns[0];
    const b = buildExactAvmGroup(offer(), payer, tnParams()).txns[0];
    expect(new TextDecoder().decode(a.note)).not.toBe(new TextDecoder().decode(b.note));
  });

  it('genesis checks', () => {
    const wrongHash = algosdk.bytesToBase64(new Uint8Array(32).fill(1));
    expect(() => buildExactAvmGroup(offer({ extra: { genesisHash: wrongHash } }), payer, tnParams())).toThrow(NetworkMismatchError);
    expect(() => buildExactAvmGroup(offer({ extra: { genesisId: 'mainnet-v1.0' } }), payer, tnParams())).toThrow(NetworkMismatchError);
    expect(() => buildExactAvmGroup(offer({ extra: { genesisHash: TESTNET.genesisHash, genesisId: 'testnet-v1.0' } }), payer, tnParams())).not.toThrow();
  });

  it('rejects invalid addresses', () => {
    expect(() => buildExactAvmGroup(offer({ payTo: 'nope' }), payer, tnParams())).toThrow(InvalidPaymentRequiredError);
    expect(() => buildExactAvmGroup(offer({ extra: { feePayer: 'nope' } }), payer, tnParams())).toThrow(InvalidPaymentRequiredError);
    expect(() => buildExactAvmGroup(offer({ extra: { feePayer: 5 } }), payer, tnParams())).toThrow(InvalidPaymentRequiredError);
  });
});

describe('payForRequirement (fake algod)', () => {
  const algodFor = (sp: algosdk.SuggestedParams) => ({ getTransactionParams: () => ({ do: async () => sp }) }) as unknown as algosdk.Algodv2;

  it('signs only the payment index and encodes a verifiable header', async () => {
    const c: PaymentRequired = { ...challenge(offer({ network: MAINNET.caip2 }), offer({ extra: { feePayer } })), resource: { url: 'https://x.test/r' } };
    const calls: number[][] = [];
    const header = await payForRequirement(c, payer, algodFor(tnParams()), async (txns, idx) => {
      calls.push(idx);
      return txns.map((t, i) => (idx.includes(i) ? algosdk.decodeUnsignedTransaction(t).signTxn(payerAcc.sk) : null));
    });
    expect(calls).toEqual([[1]]);

    const body = JSON.parse(new TextDecoder().decode(algosdk.base64ToBytes(header)));
    expect(body.x402Version).toBe(2);
    expect(body.accepted).toEqual(c.accepts[1]);
    expect(body.resource).toEqual(c.resource);
    expect(body.payload.paymentIndex).toBe(1);
    expect(body.payload.paymentGroup).toHaveLength(2);

    // Unsigned fee-payer txn decodes as plain txn; payment txn decodes as signed
    const feeEntry = algosdk.decodeUnsignedTransaction(algosdk.base64ToBytes(body.payload.paymentGroup[0]));
    expect(feeEntry.sender.toString()).toBe(feePayer);
    const signed = algosdk.decodeSignedTransaction(algosdk.base64ToBytes(body.payload.paymentGroup[1]));
    expect(signed.txn.sender.toString()).toBe(payer);
    expect(signed.sig).toBeDefined();
  });

  it('refuses offers for another network', async () => {
    await expect(payForRequirement(challenge(offer({ network: MAINNET.caip2 })), payer, algodFor(tnParams()), async (t) => t.map(() => null))).rejects.toBeInstanceOf(NetworkMismatchError);
    await expect(payForRequirement(challenge(), payer, algodFor(tnParams()), async (t) => t.map(() => null))).rejects.toBeInstanceOf(NoSupportedRequirementError);
  });
});
