import algosdk from 'algosdk';

export const ALGOD_URL = process.env.ALGOD_URL || 'http://localhost:4001';
export const ALGOD_TOKEN = process.env.ALGOD_TOKEN || 'a'.repeat(64);
export const KMD_URL = process.env.KMD_URL || 'http://localhost:4002';
export const KMD_TOKEN = process.env.KMD_TOKEN || 'a'.repeat(64);

export function parseUrl(urlStr: string) {
  const u = new URL(urlStr);
  const host = `${u.protocol}//${u.hostname}`;
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  return { host, port };
}

export function getAlgodClient(): algosdk.Algodv2 {
  return new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_URL);
}

export function getKmdClient(): algosdk.Kmd {
  const { host, port } = parseUrl(KMD_URL);
  return new algosdk.Kmd(KMD_TOKEN, host, port);
}

export interface AccountWithMnemonic {
  addr: string;
  sk: Uint8Array;
  mnemonic: string;
}

export async function getDispenserAccount(
  kmd: algosdk.Kmd,
  algod: algosdk.Algodv2
): Promise<AccountWithMnemonic> {
  const wallets = (await kmd.listWallets()).wallets;
  const defWallet = wallets.find((w: any) => w.name === 'unencrypted-default-wallet');
  if (!defWallet) {
    throw new Error('Default KMD wallet (unencrypted-default-wallet) not found');
  }
  const handle = (await kmd.initWalletHandle(defWallet.id, '')).wallet_handle_token;
  const addresses = (await kmd.listKeys(handle)).addresses;
  if (!addresses || addresses.length === 0) {
    throw new Error('No keys found in KMD default wallet');
  }

  let bestAddr = addresses[0];
  let bestBal = -1n;
  for (const addr of addresses) {
    try {
      const info = await algod.accountInformation(addr).do();
      const bal = BigInt(info.amount);
      if (bal > bestBal) {
        bestBal = bal;
        bestAddr = addr;
      }
    } catch {
      // ignore
    }
  }

  const exp = await kmd.exportKey(handle, '', bestAddr);
  const sk = exp.private_key;
  const mn = algosdk.secretKeyToMnemonic(sk);
  return { addr: bestAddr, sk, mnemonic: mn };
}

export function generateTestAccount(): AccountWithMnemonic {
  const acc = algosdk.generateAccount();
  const addr = acc.addr.toString();
  const mn = algosdk.secretKeyToMnemonic(acc.sk);
  return { addr, sk: acc.sk, mnemonic: mn };
}

export async function fundAccount(
  algod: algosdk.Algodv2,
  dispenser: AccountWithMnemonic,
  receiverAddr: string,
  amountMicroAlgos: number | bigint = 10_000_000n
): Promise<string> {
  const params = await algod.getTransactionParams().do();
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: dispenser.addr,
    receiver: receiverAddr,
    amount: BigInt(amountMicroAlgos),
    suggestedParams: params,
  });
  const signed = txn.signTxn(dispenser.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  await algosdk.waitForConfirmation(algod, txid, 4);
  return txid;
}

export async function createAsa(
  algod: algosdk.Algodv2,
  creator: AccountWithMnemonic,
  name = 'MockUSD',
  unit = 'mUSD',
  total: number | bigint = 1_000_000_000n,
  decimals = 6
): Promise<number> {
  const params = await algod.getTransactionParams().do();
  const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    sender: creator.addr,
    total: BigInt(total),
    decimals,
    defaultFrozen: false,
    assetName: name,
    unitName: unit,
    suggestedParams: params,
  });
  const signed = txn.signTxn(creator.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  const conf = await algosdk.waitForConfirmation(algod, txid, 4);
  return Number(conf.assetIndex ?? conf['asset-index']);
}

export async function optInAsa(
  algod: algosdk.Algodv2,
  account: AccountWithMnemonic,
  assetId: number
): Promise<string> {
  const params = await algod.getTransactionParams().do();
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: account.addr,
    receiver: account.addr,
    assetIndex: assetId,
    amount: 0n,
    suggestedParams: params,
  });
  const signed = txn.signTxn(account.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  await algosdk.waitForConfirmation(algod, txid, 4);
  return txid;
}

export async function transferAsa(
  algod: algosdk.Algodv2,
  from: AccountWithMnemonic,
  toAddr: string,
  assetId: number,
  amount: number | bigint
): Promise<string> {
  const params = await algod.getTransactionParams().do();
  const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: from.addr,
    receiver: toAddr,
    assetIndex: assetId,
    amount: BigInt(amount),
    suggestedParams: params,
  });
  const signed = txn.signTxn(from.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  await algosdk.waitForConfirmation(algod, txid, 4);
  return txid;
}

export function getAssetHolding(accountInfo: any, assetId: number | bigint): bigint {
  const assets = accountInfo.assets ?? [];
  const asset = assets.find(
    (a: any) => Number(a.assetId ?? a['asset-id']) === Number(assetId)
  );
  return asset ? BigInt(asset.amount) : 0n;
}
