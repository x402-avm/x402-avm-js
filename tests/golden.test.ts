import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import algosdk from 'algosdk';
import {
  decodePaymentRequired,
  payForRequirement,
  buildIdentityTxn,
  encodeIdentityHeader,
} from '../src/index.js';
import {
  getAlgodClient,
  getKmdClient,
  getDispenserAccount,
  generateTestAccount,
  fundAccount,
} from './helpers.js';

const isLocalNet = process.env.LOCALNET === '1';
const describeLocalNet = isLocalNet ? describe : describe.skip;

const PYTHON_PATH = process.env.PYTHON_PATH || 'python3';
const PY_VERIFY_SCRIPT = path.resolve(__dirname, 'py_verify.py');
const MAKE_402_SCRIPT = path.resolve(__dirname, 'fixtures/make_402.py');

describeLocalNet('GOLDEN Cross-Language Integration Tests (LOCALNET=1)', () => {
  it('builds, signs, verifies, and settles ALGO payment on LocalNet, decreasing balance by exactly 5000', async () => {
    const algod = getAlgodClient();
    const kmd = getKmdClient();
    const dispenser = await getDispenserAccount(kmd, algod);

    const client1Account = generateTestAccount();
    const serverAccount = generateTestAccount();

    await fundAccount(algod, dispenser, client1Account.addr, 10_000_000n);
    await fundAccount(algod, dispenser, serverAccount.addr, 10_000_000n);

    const client1Addr = client1Account.addr;
    const serverAddr = serverAccount.addr;

    // Initial balance before payment
    const accBefore = await algod.accountInformation(client1Addr).do();
    const balanceBefore = BigInt(accBefore.amount);

    // Generate fresh 402 requirement fixture at test time
    const make402Out = execFileSync(
      PYTHON_PATH,
      [
        MAKE_402_SCRIPT,
        '--price',
        '5000',
        '--asset',
        '0',
        '--pay-to',
        serverAddr,
        '--fee-payer-mnemonic',
        serverAccount.mnemonic,
      ],
      { encoding: 'utf-8' }
    );
    const fixtureB64 = make402Out.trim().split('\n').pop()!;
    const paymentRequired = decodePaymentRequired(fixtureB64);
    expect(paymentRequired.accepts).toHaveLength(1);
    expect(paymentRequired.accepts[0].amount).toBe('5000');

    // Sign callback simulating browser wallet signTransactions
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
    expect(typeof paymentHeader).toBe('string');

    // Write header to temporary file
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'x402-test-'));
    const tempFile = path.join(tempDir, 'payment_header.b64');
    fs.writeFileSync(tempFile, paymentHeader, 'utf-8');

    let pyResultJson: any;
    try {
      // Spawn Python verification and settlement script
      const stdout = execFileSync(
        PYTHON_PATH,
        [PY_VERIFY_SCRIPT, tempFile, '--fee-payer-mnemonic', serverAccount.mnemonic],
        {
          encoding: 'utf-8',
        }
      );
      pyResultJson = JSON.parse(stdout.trim());
    } finally {
      try {
        fs.unlinkSync(tempFile);
        fs.rmdirSync(tempDir);
      } catch {
        // ignore cleanup error
      }
    }

    // Verify Python output
    expect(pyResultJson).toBeDefined();
    expect(pyResultJson.verify).toBe(true);
    expect(pyResultJson.settled_txid).toBeDefined();
    expect(typeof pyResultJson.settled_txid).toBe('string');
    expect(pyResultJson.settled_txid.length).toBeGreaterThan(10);
    expect(pyResultJson.payer).toBe(client1Addr);

    // Verify balance decreased by exactly 5000 microAlgos
    const accAfter = await algod.accountInformation(client1Addr).do();
    const balanceAfter = BigInt(accAfter.amount);
    const balanceDiff = balanceBefore - balanceAfter;
    expect(balanceDiff).toBe(5000n);
  });

  it('signs identity txn in TS and verifies with Python ai_economy_sdk verify_identity_txn', async () => {
    const algod = getAlgodClient();
    const client1Account = generateTestAccount();
    const client1Addr = client1Account.addr;

    const sp = await algod.getTransactionParams().do();
    const genesisHashB64 = Buffer.from(sp.genesisHash).toString('base64');
    expect(genesisHashB64).toBeDefined();

    // 1. Build identity transaction
    const identityTxn = buildIdentityTxn(client1Addr, genesisHashB64);

    // 2. Sign transaction with client1 private key
    const signedIdentityBytes = identityTxn.signTxn(client1Account.sk);

    // 3. Encode into header
    const identityHeader = encodeIdentityHeader(signedIdentityBytes);
    expect(identityHeader).toBeDefined();
    expect(typeof identityHeader).toBe('string');

    // 4. Verify using Python verify_identity_txn helper
    const stdout = execFileSync(
      PYTHON_PATH,
      [PY_VERIFY_SCRIPT, '--identity', identityHeader, '--genesis-hash', genesisHashB64],
      { encoding: 'utf-8' }
    );

    const pyResult = JSON.parse(stdout.trim());
    expect(pyResult.valid).toBe(true);
    expect(pyResult.address).toBe(client1Addr);
  });
});
