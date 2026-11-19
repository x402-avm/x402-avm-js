import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import algosdk from 'algosdk';
import {
  decodePaymentRequired,
  payForRequirement,
  buildExactAvmGroup,
  encodePaymentHeader,
  buildIdentityTxn,
  encodeIdentityHeader,
} from '../src/index.js';
import {
  getAlgodClient,
  getKmdClient,
  getDispenserAccount,
  generateTestAccount,
  fundAccount,
  createAsa,
  optInAsa,
  transferAsa,
  getAssetHolding,
  AccountWithMnemonic,
} from './helpers.js';

const isLocalNet = process.env.LOCALNET === '1';
const describeLocalNet = isLocalNet ? describe : describe.skip;

const PYTHON_PATH = process.env.PYTHON_PATH || 'python3';
const PY_VERIFY_SCRIPT = path.resolve(__dirname, 'py_verify.py');
const MAKE_402_SCRIPT = path.resolve(__dirname, 'fixtures/make_402.py');

function runPyVerify(header: string, feePayerMnemonic: string): any {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'x402-asa-test-'));
  const tempFile = path.join(tempDir, 'payment_header.b64');
  try {
    fs.writeFileSync(tempFile, header, 'utf-8');
    const stdout = execFileSync(
      PYTHON_PATH,
      [PY_VERIFY_SCRIPT, tempFile, '--fee-payer-mnemonic', feePayerMnemonic],
      { encoding: 'utf-8' }
    );
    return JSON.parse(stdout.trim());
  } finally {
    try {
      fs.unlinkSync(tempFile);
      fs.rmdirSync(tempDir);
    } catch {
      // ignore cleanup error
    }
  }
}

describeLocalNet('GOLDEN ASA Cross-Language Tests (LOCALNET=1)', () => {
  let algod: algosdk.Algodv2;
  let kmd: algosdk.Kmd;
  let dispenser: AccountWithMnemonic;
  let client1Account: AccountWithMnemonic;
  let client2Account: AccountWithMnemonic;
  let vendorBAccount: AccountWithMnemonic;
  let musdAssetId: number;

  beforeAll(async () => {
    algod = getAlgodClient();
    kmd = getKmdClient();
    dispenser = await getDispenserAccount(kmd, algod);

    client1Account = generateTestAccount();
    client2Account = generateTestAccount();
    vendorBAccount = generateTestAccount();

    await fundAccount(algod, dispenser, client1Account.addr, 10_000_000n);
    await fundAccount(algod, dispenser, client2Account.addr, 10_000_000n);
    await fundAccount(algod, dispenser, vendorBAccount.addr, 10_000_000n);

    // Create mUSD-like ASA in test setup
    musdAssetId = await createAsa(algod, vendorBAccount, 'MockUSD', 'mUSD', 1_000_000_000n, 6);

    // Opt-in buyer and client2 accounts
    await optInAsa(algod, client1Account, musdAssetId);
    await optInAsa(algod, client2Account, musdAssetId);

    // Fund client1 with 50,000 units of mUSD
    await transferAsa(algod, vendorBAccount, client1Account.addr, musdAssetId, 50_000n);
  });

  it('builds, signs, verifies, and settles mUSD (ASA) payment on LocalNet with exact balance deltas', async () => {
    const client1Addr = client1Account.addr;
    const vendorBAddr = vendorBAccount.addr;

    // Initial balances before payment
    const client1Before = await algod.accountInformation(client1Addr).do();
    const client1AlgoBefore = BigInt(client1Before.amount);
    const client1MusdBefore = getAssetHolding(client1Before, musdAssetId);

    const vendorBBefore = await algod.accountInformation(vendorBAddr).do();
    const vendorBAlgoBefore = BigInt(vendorBBefore.amount);
    const vendorBMusdBefore = getAssetHolding(vendorBBefore, musdAssetId);

    // Generate 402 requirements for mUSD: price 7000, pay_to vendorB, feePayer vendorB
    const make402Out = execFileSync(
      PYTHON_PATH,
      [
        MAKE_402_SCRIPT,
        '--asset',
        String(musdAssetId),
        '--pay-to',
        vendorBAddr,
        '--fee-payer-mnemonic',
        vendorBAccount.mnemonic,
        '--price',
        '7000',
      ],
      { encoding: 'utf-8' }
    );
    const fixtureB64 = make402Out.trim().split('\n').pop()!;
    const paymentRequired = decodePaymentRequired(fixtureB64);

    expect(paymentRequired.accepts).toHaveLength(1);
    const req = paymentRequired.accepts[0];
    expect(req.asset).toBe(String(musdAssetId));
    expect(req.amount).toBe('7000');
    expect(req.payTo).toBe(vendorBAddr);
    expect(req.extra?.feePayer).toBe(vendorBAddr);

    // Client1 sign callback
    const signTxns = async (unsignedBytesList: Uint8Array[], indexes: number[]) => {
      return unsignedBytesList.map((bytes, idx) => {
        if (indexes.includes(idx)) {
          const txn = algosdk.decodeUnsignedTransaction(bytes);
          return txn.signTxn(client1Account.sk);
        }
        return null;
      });
    };

    // Pay for requirement
    const paymentHeader = await payForRequirement(paymentRequired, client1Addr, algod, signTxns);
    expect(paymentHeader).toBeDefined();

    // Verify and settle via py_verify
    const pyResult = runPyVerify(paymentHeader, vendorBAccount.mnemonic);
    expect(pyResult.verify).toBe(true);
    expect(pyResult.settled_txid).toBeDefined();
    expect(pyResult.payment_txid).toBeDefined();

    // Verify on-chain transaction: axfer of musdAssetId with amount 7000 to vendorB
    const confirmedTxn = await algod.pendingTransactionInformation(pyResult.payment_txid).do();
    const confirmedRound = confirmedTxn.confirmedRound ?? confirmedTxn['confirmed-round'];
    expect(confirmedRound).toBeDefined();
    expect(Number(confirmedRound)).toBeGreaterThan(0);

    const txnInner = (confirmedTxn.txn as any)?.txn ?? confirmedTxn.txn;
    const txnType = txnInner.type ?? txnInner.txType;
    expect(txnType).toBe('axfer');

    const assetId = Number(
      txnInner.assetTransfer?.assetIndex ??
      txnInner.assetIndex ??
      txnInner.xaid
    );
    expect(assetId).toBe(musdAssetId);

    const amount = Number(
      txnInner.assetTransfer?.amount ??
      txnInner.amount ??
      txnInner.aamt
    );
    expect(amount).toBe(7000);

    const receiverObj =
      txnInner.assetTransfer?.receiver ??
      txnInner.receiver ??
      txnInner.to ??
      txnInner.arcv;
    const arcvAddr = receiverObj?.toString
      ? receiverObj.toString()
      : typeof receiverObj === 'string'
      ? receiverObj
      : algosdk.encodeAddress(receiverObj);
    expect(arcvAddr).toBe(vendorBAddr);

    // Balances after payment
    const client1After = await algod.accountInformation(client1Addr).do();
    const client1AlgoAfter = BigInt(client1After.amount);
    const client1MusdAfter = getAssetHolding(client1After, musdAssetId);

    const vendorBAfter = await algod.accountInformation(vendorBAddr).do();
    const vendorBAlgoAfter = BigInt(vendorBAfter.amount);
    const vendorBMusdAfter = getAssetHolding(vendorBAfter, musdAssetId);

    // Assert exact balance deltas:
    // client1 mUSD -7000 exact
    expect(client1MusdBefore - client1MusdAfter).toBe(7000n);
    // client1 ALGO unchanged (fee was covered by feePayer vendorB)
    expect(client1AlgoBefore - client1AlgoAfter).toBe(0n);
    // vendorB ALGO -2000 (fees for atomic group)
    expect(vendorBAlgoBefore - vendorBAlgoAfter).toBe(2000n);
    // vendorB mUSD +7000
    expect(vendorBMusdAfter - vendorBMusdBefore).toBe(7000n);
  });

  describe('Negative Golden Test Cases', () => {
    it('rejects payment with tampered amount (price - 1) and changes no balances', async () => {
      const client1Addr = client1Account.addr;
      const vendorBAddr = vendorBAccount.addr;
      const sp = await algod.getTransactionParams().do();

      // Read balances before
      const c1Before = await algod.accountInformation(client1Addr).do();
      const c1MusdBefore = getAssetHolding(c1Before, musdAssetId);

      // Generate requirement for 7000 mUSD
      const make402Out = execFileSync(
        PYTHON_PATH,
        [
          MAKE_402_SCRIPT,
          '--asset',
          String(musdAssetId),
          '--pay-to',
          vendorBAddr,
          '--fee-payer-mnemonic',
          vendorBAccount.mnemonic,
          '--price',
          '7000',
        ],
        { encoding: 'utf-8' }
      );
      const paymentRequired = decodePaymentRequired(make402Out.trim().split('\n').pop()!);
      const req = paymentRequired.accepts[0];

      // Build group
      const { txns, paymentIndex } = buildExactAvmGroup(req, client1Addr, sp);

      // Tamper amount to 6999 (price - 1)
      const tamperedPaymentTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: client1Addr,
        receiver: req.payTo,
        assetIndex: musdAssetId,
        amount: 6999n,
        suggestedParams: {
          ...sp,
          fee: 0n,
          flatFee: true,
        },
        note: txns[paymentIndex].note,
      });

      const tamperedGroup = [txns[0], tamperedPaymentTxn];
      algosdk.assignGroupID(tamperedGroup);
      const signedTamperedUser = tamperedGroup[paymentIndex].signTxn(client1Account.sk);

      const header = encodePaymentHeader(
        paymentRequired,
        req,
        [
          Buffer.from(algosdk.encodeUnsignedTransaction(tamperedGroup[0])).toString('base64'),
          Buffer.from(signedTamperedUser).toString('base64'),
        ],
        paymentIndex
      );

      const pyResult = runPyVerify(header, vendorBAccount.mnemonic);
      expect(pyResult.verify).toBe(false);
      expect(pyResult.reason).toBe('invalid_exact_avm_payload_amount_insufficient');
      expect(pyResult.settled_txid).toBeNull();

      // Balances must remain unchanged
      const c1After = await algod.accountInformation(client1Addr).do();
      const c1MusdAfter = getAssetHolding(c1After, musdAssetId);
      expect(c1MusdBefore).toBe(c1MusdAfter);
    });

    it('rejects payment signed by client2 key for client1 sender and changes no balances', async () => {
      const client1Addr = client1Account.addr;
      const vendorBAddr = vendorBAccount.addr;
      const sp = await algod.getTransactionParams().do();

      const c1Before = await algod.accountInformation(client1Addr).do();
      const c1MusdBefore = getAssetHolding(c1Before, musdAssetId);

      const make402Out = execFileSync(
        PYTHON_PATH,
        [
          MAKE_402_SCRIPT,
          '--asset',
          String(musdAssetId),
          '--pay-to',
          vendorBAddr,
          '--fee-payer-mnemonic',
          vendorBAccount.mnemonic,
          '--price',
          '7000',
        ],
        { encoding: 'utf-8' }
      );
      const paymentRequired = decodePaymentRequired(make402Out.trim().split('\n').pop()!);
      const req = paymentRequired.accepts[0];

      const { txns, paymentIndex } = buildExactAvmGroup(req, client1Addr, sp);

      // Sign client1's payment txn using client2's secret key
      const wrongSigned = txns[paymentIndex].signTxn(client2Account.sk);

      const header = encodePaymentHeader(
        paymentRequired,
        req,
        [
          Buffer.from(algosdk.encodeUnsignedTransaction(txns[0])).toString('base64'),
          Buffer.from(wrongSigned).toString('base64'),
        ],
        paymentIndex
      );

      const pyResult = runPyVerify(header, vendorBAccount.mnemonic);
      expect(pyResult.verify).toBe(false);
      expect(pyResult.reason).toBe('invalid_exact_avm_payload_invalid_signature');
      expect(pyResult.settled_txid).toBeNull();

      const c1After = await algod.accountInformation(client1Addr).do();
      const c1MusdAfter = getAssetHolding(c1After, musdAssetId);
      expect(c1MusdBefore).toBe(c1MusdAfter);
    });

    it('rejects payment sending asset 0 when requirements specify ASA and changes no balances', async () => {
      const client1Addr = client1Account.addr;
      const vendorBAddr = vendorBAccount.addr;
      const sp = await algod.getTransactionParams().do();

      const c1Before = await algod.accountInformation(client1Addr).do();
      const c1AlgoBefore = BigInt(c1Before.amount);

      const make402Out = execFileSync(
        PYTHON_PATH,
        [
          MAKE_402_SCRIPT,
          '--asset',
          String(musdAssetId),
          '--pay-to',
          vendorBAddr,
          '--fee-payer-mnemonic',
          vendorBAccount.mnemonic,
          '--price',
          '7000',
        ],
        { encoding: 'utf-8' }
      );
      const paymentRequired = decodePaymentRequired(make402Out.trim().split('\n').pop()!);
      const req = paymentRequired.accepts[0];

      // Build fee payer txn
      const minFee = sp.minFee ? Number(sp.minFee) : 1000;
      const feePayerSp = { ...sp, fee: BigInt(minFee * 2), flatFee: true };
      const feePayerTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: req.extra!.feePayer!,
        receiver: req.extra!.feePayer!,
        amount: 0,
        suggestedParams: feePayerSp,
        note: new TextEncoder().encode(`x402-fee-payer-${Date.now()}`),
      });

      // Send ALGO (payment txn with amount 7000) instead of ASA
      const userSp = { ...sp, fee: 0n, flatFee: true };
      const algoPaymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: client1Addr,
        receiver: req.payTo,
        amount: 7000n,
        suggestedParams: userSp,
        note: new TextEncoder().encode(`x402-payment-${Date.now()}`),
      });

      const group = [feePayerTxn, algoPaymentTxn];
      algosdk.assignGroupID(group);
      const signedUser = group[1].signTxn(client1Account.sk);

      const header = encodePaymentHeader(
        paymentRequired,
        req,
        [
          Buffer.from(algosdk.encodeUnsignedTransaction(group[0])).toString('base64'),
          Buffer.from(signedUser).toString('base64'),
        ],
        1
      );

      const pyResult = runPyVerify(header, vendorBAccount.mnemonic);
      expect(pyResult.verify).toBe(false);
      expect(pyResult.reason).toBe('invalid_exact_avm_payload_asset_id_mismatch');
      expect(pyResult.settled_txid).toBeNull();

      const c1After = await algod.accountInformation(client1Addr).do();
      expect(BigInt(c1After.amount)).toBe(c1AlgoBefore);
    });

    it('rejects payment where feePayer txn fee was modified after group id and changes no balances', async () => {
      const client1Addr = client1Account.addr;
      const vendorBAddr = vendorBAccount.addr;
      const sp = await algod.getTransactionParams().do();

      const vendorBBefore = await algod.accountInformation(vendorBAddr).do();
      const vendorBAlgoBefore = BigInt(vendorBBefore.amount);

      const make402Out = execFileSync(
        PYTHON_PATH,
        [
          MAKE_402_SCRIPT,
          '--asset',
          String(musdAssetId),
          '--pay-to',
          vendorBAddr,
          '--fee-payer-mnemonic',
          vendorBAccount.mnemonic,
          '--price',
          '7000',
        ],
        { encoding: 'utf-8' }
      );
      const paymentRequired = decodePaymentRequired(make402Out.trim().split('\n').pop()!);
      const req = paymentRequired.accepts[0];

      const { txns, paymentIndex } = buildExactAvmGroup(req, client1Addr, sp);
      const signedUser = txns[paymentIndex].signTxn(client1Account.sk);

      // Tamper feePayer txn fee from 2000 to 1000 AFTER group ID assignment
      txns[0].fee = 1000n;

      const header = encodePaymentHeader(
        paymentRequired,
        req,
        [
          Buffer.from(algosdk.encodeUnsignedTransaction(txns[0])).toString('base64'),
          Buffer.from(signedUser).toString('base64'),
        ],
        paymentIndex
      );

      const pyResult = runPyVerify(header, vendorBAccount.mnemonic);
      expect(pyResult.verify).toBe(false);
      expect(pyResult.reason).toBe('transaction_simulation_failed');
      expect(pyResult.settled_txid).toBeNull();

      const vendorBAfter = await algod.accountInformation(vendorBAddr).do();
      expect(BigInt(vendorBAfter.amount)).toBe(vendorBAlgoBefore);
    });
  });

  describe('Identity Stale Proof Tests', () => {
    it('returns None / invalid for an identity txn with a timestamp 300s old', async () => {
      const client1Addr = client1Account.addr;
      const sp = await algod.getTransactionParams().do();
      const genesisHashB64 = Buffer.from(sp.genesisHash).toString('base64');
      expect(genesisHashB64).toBeDefined();

      // Timestamp 300 seconds in the past
      const staleTimestamp = Math.floor(Date.now() / 1000) - 300;
      const identityTxn = buildIdentityTxn(client1Addr, genesisHashB64, staleTimestamp);
      const signedIdentityBytes = identityTxn.signTxn(client1Account.sk);
      const identityHeader = encodeIdentityHeader(signedIdentityBytes);

      const stdout = execFileSync(
        PYTHON_PATH,
        [PY_VERIFY_SCRIPT, '--identity', identityHeader, '--genesis-hash', genesisHashB64],
        { encoding: 'utf-8' }
      );

      const pyResult = JSON.parse(stdout.trim());
      expect(pyResult.valid).toBe(false);
      expect(pyResult.address).toBeNull();
    });
  });
});
