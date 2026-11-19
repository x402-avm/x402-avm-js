import { describe, it, expect } from 'vitest';
import algosdk from 'algosdk';
import {
  DEFAULT_MAX_AMOUNT,
  MAINNET,
  TESTNET,
  PaymentNotAllowedError,
  SpendLimitExceededError,
  InvalidOptionsError,
  InvalidPaymentRequiredError,
  X402AvmError,
  buildExactAvmGroup,
  checkSpendControls,
  payForRequirement,
  type PaymentRequirements,
  type PaymentRequired,
} from '../src/index.js';

const payTo = algosdk.generateAccount().addr.toString();
const payer = algosdk.generateAccount().addr.toString();
const gh = new Uint8Array(32).fill(3);

const sp: algosdk.SuggestedParams = {
  fee: 1000n,
  minFee: 1000n,
  firstValid: 10n,
  lastValid: 1010n,
  genesisHash: gh,
  genesisID: 'testnet-v1.0',
  flatFee: true,
};

const req = (over: Partial<PaymentRequirements> = {}): PaymentRequirements => ({
  scheme: 'exact',
  network: TESTNET.caip2,
  asset: '0',
  amount: '5000',
  payTo,
  maxTimeoutSeconds: 300,
  ...over,
});

describe('spend controls', () => {
  it('default cap is 1,000,000 base units', () => {
    expect(DEFAULT_MAX_AMOUNT).toBe(1_000_000n);
    expect(() => checkSpendControls(req({ amount: '1000000' }))).not.toThrow();
    expect(() => checkSpendControls(req({ amount: '1000001' }))).toThrow(SpendLimitExceededError);
    expect(() => checkSpendControls(req({ amount: '1000001', asset: '31566704' }))).toThrow(SpendLimitExceededError);
  });

  it('SpendLimitExceededError carries details and is an X402AvmError', () => {
    try {
      checkSpendControls(req({ amount: '2000000' }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SpendLimitExceededError);
      expect(e).toBeInstanceOf(X402AvmError);
      expect(e).toBeInstanceOf(Error);
      const err = e as SpendLimitExceededError;
      expect(err.name).toBe('SpendLimitExceededError');
      expect(err.code).toBe('spend_limit_exceeded');
      expect(err.amount).toBe(2_000_000n);
      expect(err.limit).toBe(1_000_000n);
      expect(err.asset).toBe('0');
      expect(err.message).toContain('maxAmount');
    }
  });

  it('maxAmount accepts bigint, number, and string', () => {
    for (const v of [5000n, 5000, '5000']) {
      expect(() => checkSpendControls(req(), { maxAmount: v })).not.toThrow();
      expect(() => checkSpendControls(req({ amount: '5001' }), { maxAmount: v })).toThrow(SpendLimitExceededError);
    }
  });

  it('maxAmount can raise the cap above the default, or remove it with Infinity', () => {
    const big = req({ amount: '50000000' });
    expect(() => checkSpendControls(big, { maxAmount: 50_000_000n })).not.toThrow();
    expect(() => checkSpendControls(big, { maxAmount: Infinity })).not.toThrow();
  });

  it('maxAmount per asset with "*" fallback and default for unlisted assets', () => {
    const controls = { maxAmount: { '0': 100, '*': 200 } };
    expect(() => checkSpendControls(req({ amount: '100' }), controls)).not.toThrow();
    expect(() => checkSpendControls(req({ amount: '101' }), controls)).toThrow(SpendLimitExceededError);
    expect(() => checkSpendControls(req({ asset: '7', amount: '200' }), controls)).not.toThrow();
    expect(() => checkSpendControls(req({ asset: '7', amount: '201' }), controls)).toThrow(SpendLimitExceededError);
    // asset not listed and no "*": default cap
    const only0 = { maxAmount: { '0': 100 } };
    expect(() => checkSpendControls(req({ asset: '7', amount: '1000000' }), only0)).not.toThrow();
    expect(() => checkSpendControls(req({ asset: '7', amount: '1000001' }), only0)).toThrow(SpendLimitExceededError);
  });

  it('rejects malformed limits', () => {
    for (const bad of [-1, 1.5, NaN, '-5', 'abc', -1n]) {
      expect(() => checkSpendControls(req(), { maxAmount: bad as never })).toThrow(InvalidOptionsError);
    }
    expect(() => checkSpendControls(req(), { maxAmount: { '0': -1 } })).toThrow(InvalidOptionsError);
  });

  it('allowedAssets', () => {
    expect(() => checkSpendControls(req(), { allowedAssets: ['0', 31566704] })).not.toThrow();
    expect(() => checkSpendControls(req({ asset: '31566704' }), { allowedAssets: ['0', 31566704] })).not.toThrow();
    expect(() => checkSpendControls(req({ asset: '31566704' }), { allowedAssets: [31566704n] })).not.toThrow();
    expect(() => checkSpendControls(req({ asset: '99' }), { allowedAssets: ['0'] })).toThrow(PaymentNotAllowedError);
  });

  it('allowedNetworks accepts names and CAIP-2 ids', () => {
    expect(() => checkSpendControls(req(), { allowedNetworks: ['testnet'] })).not.toThrow();
    expect(() => checkSpendControls(req({ network: 'algorand:' + TESTNET.genesisHash }), { allowedNetworks: [TESTNET.caip2] })).not.toThrow();
    expect(() => checkSpendControls(req({ network: MAINNET.caip2 }), { allowedNetworks: ['testnet'] })).toThrow(PaymentNotAllowedError);
    // an unresolvable offered network is never allowed
    expect(() => checkSpendControls(req({ network: 'eip155:1' }), { allowedNetworks: ['testnet'] })).toThrow(PaymentNotAllowedError);
  });

  it('allowedPayTo', () => {
    expect(() => checkSpendControls(req(), { allowedPayTo: [payTo] })).not.toThrow();
    const other = algosdk.generateAccount().addr.toString();
    try {
      checkSpendControls(req(), { allowedPayTo: [other] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PaymentNotAllowedError);
      expect((e as PaymentNotAllowedError).field).toBe('payTo');
      expect((e as PaymentNotAllowedError).value).toBe(payTo);
    }
  });

  it('rejects non-integer amount and asset', () => {
    expect(() => checkSpendControls(req({ amount: '-1' }))).toThrow(InvalidPaymentRequiredError);
    expect(() => checkSpendControls(req({ amount: '1.5' }))).toThrow(InvalidPaymentRequiredError);
    expect(() => checkSpendControls(req({ asset: 'usdc' }))).toThrow(InvalidPaymentRequiredError);
    expect(() => checkSpendControls(req({ amount: '18446744073709551616' }), { maxAmount: Infinity })).toThrow(InvalidPaymentRequiredError);
  });

  it('buildExactAvmGroup enforces the default cap and builds nothing', () => {
    expect(() => buildExactAvmGroup(req({ amount: '1000001' }), payer, sp)).toThrow(SpendLimitExceededError);
    const ok = buildExactAvmGroup(req({ amount: '1000001' }), payer, sp, { maxAmount: 2_000_000 });
    expect(ok.txns[ok.paymentIndex].payment?.amount).toBe(1_000_001n);
  });

  it('payForRequirement refuses before the signer is called', async () => {
    const algod = { getTransactionParams: () => ({ do: async () => ({ ...sp, genesisHash: algosdk.base64ToBytes(TESTNET.genesisHash) }) }) } as unknown as algosdk.Algodv2;
    const pr: PaymentRequired = { x402Version: 2, accepts: [req({ amount: '9999999' })] };
    let signed = false;
    const signer = async (t: Uint8Array[]) => {
      signed = true;
      return t.map(() => null);
    };
    await expect(payForRequirement(pr, payer, algod, signer)).rejects.toBeInstanceOf(SpendLimitExceededError);
    expect(signed).toBe(false);
    await expect(payForRequirement(pr, payer, algod, signer, { allowedPayTo: [payer] })).rejects.toBeInstanceOf(SpendLimitExceededError);
    const header = await payForRequirement(pr, payer, algod, signer, { maxAmount: 10_000_000n });
    expect(signed).toBe(true);
    expect(header.length).toBeGreaterThan(0);
  });
});
