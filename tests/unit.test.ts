import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import algosdk from 'algosdk';
import {
  decodePaymentRequired,
  buildExactAvmGroup,
  encodePaymentHeader,
  buildIdentityTxn,
  encodeIdentityHeader,
  PaymentRequirements,
  PaymentRequired,
} from '../src/index.js';

describe('x402-avm-js Unit Tests', () => {
  const dummyAcc1 = algosdk.generateAccount();
  const dummyAcc2 = algosdk.generateAccount();
  const payerAddr = dummyAcc1.addr.toString();
  const payToAddr = dummyAcc2.addr.toString();

  const mockGhBytes = new Uint8Array(32).fill(7);
  const mockGhB64 = Buffer.from(mockGhBytes).toString('base64');

  const baseSuggestedParams: algosdk.SuggestedParams = {
    fee: 1000n,
    minFee: 1000n,
    firstValid: 100n,
    lastValid: 1100n,
    genesisHash: mockGhBytes,
    genesisID: 'testnet-v1.0',
    flatFee: true,
  };

  describe('decodePaymentRequired', () => {
    it('decodes a real base64 PAYMENT-REQUIRED header fixture', () => {
      const fixturePath = path.resolve(__dirname, 'fixtures/payment_required.b64');
      const b64 = fs.readFileSync(fixturePath, 'utf-8').trim();

      const decoded = decodePaymentRequired(b64);
      expect(decoded.x402Version).toBe(2);
      expect(decoded.error).toBe('Payment required');
      expect(decoded.resource).toBeDefined();
      expect(decoded.resource?.url).toContain('http://testserver/messages/');
      expect(decoded.accepts).toHaveLength(1);

      const req = decoded.accepts[0];
      expect(req.scheme).toBe('exact');
      expect(req.asset).toBe('0');
      expect(req.amount).toBe('5000');
      expect(req.payTo).toBeDefined();
      expect(req.extra?.feePayer).toBeDefined();
      expect(req.extra?.genesisHash).toBeDefined();
    });
  });

  describe('buildExactAvmGroup - ALGO (asset 0)', () => {
    it('builds 2-txn group with fee abstraction when feePayer is present', () => {
      const feePayerAcc = algosdk.generateAccount();
      const feePayerAddr = feePayerAcc.addr.toString();

      const req: PaymentRequirements = {
        scheme: 'exact',
        network: 'algorand:test',
        asset: '0',
        amount: '5000',
        payTo: payToAddr,
        maxTimeoutSeconds: 300,
        extra: {
          feePayer: feePayerAddr,
        },
      };

      const result = buildExactAvmGroup(req, payerAddr, baseSuggestedParams);
      expect(result.txns).toHaveLength(2);
      expect(result.paymentIndex).toBe(1);
      expect(result.signIndexes).toEqual([1]);

      const [feeTxn, payTxn] = result.txns;

      // Group ID
      expect(feeTxn.group).toBeDefined();
      expect(payTxn.group).toBeDefined();
      expect(Buffer.from(feeTxn.group!).toString('hex')).toBe(
        Buffer.from(payTxn.group!).toString('hex')
      );

      // Fee payer txn checks
      expect(feeTxn.type).toBe(algosdk.TransactionType.pay);
      expect(feeTxn.sender.toString()).toBe(feePayerAddr);
      expect(feeTxn.payment?.receiver.toString()).toBe(feePayerAddr);
      expect(feeTxn.payment?.amount).toBe(0n);
      expect(feeTxn.fee).toBe(2000n); // pooled fee: 2 * minFee

      const feeNote = new TextDecoder().decode(feeTxn.note);
      expect(feeNote.startsWith('x402-fee-payer-')).toBe(true);

      // Payment txn checks
      expect(payTxn.type).toBe(algosdk.TransactionType.pay);
      expect(payTxn.sender.toString()).toBe(payerAddr);
      expect(payTxn.payment?.receiver.toString()).toBe(payToAddr);
      expect(payTxn.payment?.amount).toBe(5000n);
      expect(payTxn.fee).toBe(0n); // covered by pooled fee

      const payNote = new TextDecoder().decode(payTxn.note);
      expect(payNote.startsWith('x402-payment-')).toBe(true);
    });

    it('builds 1-txn group without fee abstraction when feePayer is absent', () => {
      const req: PaymentRequirements = {
        scheme: 'exact',
        network: 'algorand:test',
        asset: '0',
        amount: '5000',
        payTo: payToAddr,
        maxTimeoutSeconds: 300,
      };

      const result = buildExactAvmGroup(req, payerAddr, baseSuggestedParams);
      expect(result.txns).toHaveLength(1);
      expect(result.paymentIndex).toBe(0);
      expect(result.signIndexes).toEqual([0]);

      const payTxn = result.txns[0];
      expect(payTxn.type).toBe(algosdk.TransactionType.pay);
      expect(payTxn.sender.toString()).toBe(payerAddr);
      expect(payTxn.payment?.receiver.toString()).toBe(payToAddr);
      expect(payTxn.payment?.amount).toBe(5000n);
      expect(payTxn.fee).toBe(1000n);

      const payNote = new TextDecoder().decode(payTxn.note);
      expect(payNote.startsWith('x402-payment-')).toBe(true);
    });
  });

  describe('buildExactAvmGroup - ASA (asset != 0)', () => {
    it('builds 2-txn group with assetTransfer when feePayer is present', () => {
      const feePayerAcc = algosdk.generateAccount();
      const feePayerAddr = feePayerAcc.addr.toString();

      const req: PaymentRequirements = {
        scheme: 'exact',
        network: 'algorand:test',
        asset: '999888',
        amount: '250000',
        payTo: payToAddr,
        maxTimeoutSeconds: 300,
        extra: {
          feePayer: feePayerAddr,
        },
      };

      const result = buildExactAvmGroup(req, payerAddr, baseSuggestedParams);
      expect(result.txns).toHaveLength(2);
      expect(result.paymentIndex).toBe(1);
      expect(result.signIndexes).toEqual([1]);

      const [feeTxn, payTxn] = result.txns;
      expect(feeTxn.type).toBe(algosdk.TransactionType.pay);
      expect(feeTxn.fee).toBe(2000n);

      expect(payTxn.type).toBe(algosdk.TransactionType.axfer);
      expect(payTxn.sender.toString()).toBe(payerAddr);
      expect(payTxn.assetTransfer?.assetIndex).toBe(999888n);
      expect(payTxn.assetTransfer?.amount).toBe(250000n);
      expect(payTxn.assetTransfer?.receiver.toString()).toBe(payToAddr);
      expect(payTxn.fee).toBe(0n);

      const payNote = new TextDecoder().decode(payTxn.note);
      expect(payNote.startsWith('x402-payment-')).toBe(true);
    });

    it('builds 1-txn group with assetTransfer when feePayer is absent', () => {
      const req: PaymentRequirements = {
        scheme: 'exact',
        network: 'algorand:test',
        asset: '999888',
        amount: '250000',
        payTo: payToAddr,
        maxTimeoutSeconds: 300,
      };

      const result = buildExactAvmGroup(req, payerAddr, baseSuggestedParams);
      expect(result.txns).toHaveLength(1);
      expect(result.paymentIndex).toBe(0);
      expect(result.signIndexes).toEqual([0]);

      const payTxn = result.txns[0];
      expect(payTxn.type).toBe(algosdk.TransactionType.axfer);
      expect(payTxn.assetTransfer?.assetIndex).toBe(999888n);
      expect(payTxn.assetTransfer?.amount).toBe(250000n);
      expect(payTxn.fee).toBe(1000n);
    });
  });

  describe('encodePaymentHeader', () => {
    it('encodes payment header matching Python x402 wrapper structure', () => {
      const paymentRequired: PaymentRequired = {
        x402Version: 2,
        error: 'Payment required',
        resource: {
          url: 'http://testserver/resource',
          description: 'Test resource',
          mimeType: 'application/json',
        },
        accepts: [
          {
            scheme: 'exact',
            network: 'algorand:test',
            asset: '0',
            amount: '5000',
            payTo: payToAddr,
            maxTimeoutSeconds: 300,
          },
        ],
        extensions: { customKey: 'customVal' },
      };

      const groupB64 = ['dGVzdDE=', 'dGVzdDI='];
      const header = encodePaymentHeader(paymentRequired, paymentRequired.accepts[0], groupB64, 1);

      expect(typeof header).toBe('string');
      const decodedJson = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));

      expect(decodedJson.x402Version).toBe(2);
      expect(decodedJson.accepted).toEqual(paymentRequired.accepts[0]);
      expect(decodedJson.resource).toEqual(paymentRequired.resource);
      expect(decodedJson.extensions).toEqual(paymentRequired.extensions);
      expect(decodedJson.payload).toEqual({
        paymentGroup: groupB64,
        paymentIndex: 1,
      });
    });
  });

  describe('buildIdentityTxn and encodeIdentityHeader', () => {
    it('builds identity transaction conforming to design section 5', () => {
      const fixedTs = 1700000000;
      const txn = buildIdentityTxn(payerAddr, mockGhB64, fixedTs);

      expect(txn.type).toBe(algosdk.TransactionType.pay);
      expect(txn.sender.toString()).toBe(payerAddr);
      expect(txn.payment?.receiver.toString()).toBe(payerAddr);
      expect(txn.payment?.amount).toBe(0n);
      expect(txn.fee).toBe(0n);
      expect(txn.firstValid).toBe(1n);
      expect(txn.lastValid).toBe(1000n);
      expect(txn.lastValid - txn.firstValid).toBeLessThanOrEqual(1000n);

      const noteStr = new TextDecoder().decode(txn.note);
      expect(noteStr).toBe(`x402-identity:${payerAddr}:${fixedTs}`);

      expect(Buffer.from(txn.genesisHash).toString('base64')).toBe(mockGhB64);
    });

    it('encodes signed identity txn to base64 header string', () => {
      const txn = buildIdentityTxn(payerAddr, mockGhB64);
      const signedBytes = txn.signTxn(dummyAcc1.sk);
      const header = encodeIdentityHeader(signedBytes);

      expect(typeof header).toBe('string');
      expect(header.length).toBeGreaterThan(0);

      // Decodes back to original bytes
      const decodedBytes = new Uint8Array(Buffer.from(header, 'base64'));
      expect(decodedBytes).toEqual(signedBytes);
    });
  });
});
