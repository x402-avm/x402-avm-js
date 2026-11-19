#!/usr/bin/env python3
"""Helper script to generate real 402 PAYMENT-REQUIRED header via PaymentGate.

Designed for self-contained execution across LocalNet environments without hardcoded accounts.
"""

import argparse
import base64
import json
import os
import sys
from pathlib import Path

from algosdk import kmd, mnemonic
from algosdk.v2client import algod
from fastmcp import FastMCP
from starlette.testclient import TestClient

from ai_economy_sdk import PaymentGate, DefaultAvmSigner, resolve_network
from x402_algorand.utils import caip2_from_genesis_hash

DEFAULT_ALGOD_URL = os.environ.get("ALGOD_URL", "http://localhost:4001")
DEFAULT_ALGOD_TOKEN = os.environ.get("ALGOD_TOKEN", "a" * 64)
DEFAULT_KMD_URL = os.environ.get("KMD_URL", "http://localhost:4002")
DEFAULT_KMD_TOKEN = os.environ.get("KMD_TOKEN", "a" * 64)
FIXTURES_DIR = Path(__file__).resolve().parent


def get_kmd_dispenser(
    kmd_url: str = DEFAULT_KMD_URL,
    kmd_token: str = DEFAULT_KMD_TOKEN,
    algod_url: str = DEFAULT_ALGOD_URL,
    algod_token: str = DEFAULT_ALGOD_TOKEN,
) -> tuple[str, str]:
    """Retrieve address and mnemonic of the primary dispenser account from KMD."""
    k = kmd.KMDClient(kmd_token, kmd_url)
    a = algod.AlgodClient(algod_token, algod_url)
    wallets = k.list_wallets()
    def_wallet = next(
        (w for w in wallets if w.get("name") == "unencrypted-default-wallet"), None
    )
    if not def_wallet:
        raise ValueError("KMD unencrypted-default-wallet not found")
    handle = k.init_wallet_handle(def_wallet["id"], "")
    keys = k.list_keys(handle)
    if not keys:
        raise ValueError("No keys found in KMD wallet")
    best_key = keys[0]
    best_bal = -1
    for key in keys:
        try:
            info = a.account_info(key)
            bal = info.get("amount", 0)
            if bal > best_bal:
                best_bal = bal
                best_key = key
        except Exception:
            pass
    pk = k.export_key(handle, "", best_key)
    return best_key, mnemonic.from_private_key(pk)


def generate_402(
    price: int = 5000,
    asset_id: int | str = 0,
    pay_to: str | None = None,
    fee_payer_mnemonic: str | None = None,
    network: str | None = None,
    algod_url: str = DEFAULT_ALGOD_URL,
    algod_token: str = DEFAULT_ALGOD_TOKEN,
) -> str:
    algod_client = algod.AlgodClient(algod_token, algod_url)

    if fee_payer_mnemonic:
        fee_payer_pk = mnemonic.to_private_key(fee_payer_mnemonic)
        signer = DefaultAvmSigner(fee_payer_pk)
        fee_payer_addr = signer.address
    else:
        disp_addr, disp_mne = get_kmd_dispenser(algod_url=algod_url, algod_token=algod_token)
        fee_payer_pk = mnemonic.to_private_key(disp_mne)
        signer = DefaultAvmSigner(fee_payer_pk)
        fee_payer_addr = disp_addr

    pay_to_addr = pay_to or fee_payer_addr

    if network:
        net_id = resolve_network(network)
    else:
        sp = algod_client.suggested_params()
        net_id = caip2_from_genesis_hash(sp.gh)

    asset_num = int(asset_id)

    gate = PaymentGate(
        signer=signer,
        network=net_id,
        pay_to=pay_to_addr,
        asset_id=asset_num,
        prices={"service": price},
        default_price=price,
        allow_loss=True,
    )

    m = FastMCP("service")

    @m.tool()
    def service() -> str:
        return "ok"

    app = gate.wrap(m)
    client = TestClient(app)
    resp = client.post(
        "/messages/?session_id=" + "0" * 32,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": "service", "arguments": {}},
        },
    )

    assert resp.status_code == 402, f"Expected 402, got {resp.status_code}"
    hdr = resp.headers.get("payment-required")
    assert hdr, "payment-required header missing"
    return hdr


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate 402 PAYMENT-REQUIRED header")
    parser.add_argument("--price", type=int, default=5000, help="Tool price")
    parser.add_argument("--asset", type=str, default="0", help="Asset ID (0 for ALGO, or ASA ID like 3456)")
    parser.add_argument("--pay-to", type=str, default=None, help="Pay to address")
    parser.add_argument("--fee-payer-mnemonic", type=str, default=None, help="Mnemonic for fee payer account")
    parser.add_argument("--network", type=str, default=None, help="Network identifier or alias (e.g. localnet)")
    parser.add_argument("--algod-url", type=str, default=DEFAULT_ALGOD_URL, help="Algod server URL")
    parser.add_argument("--algod-token", type=str, default=DEFAULT_ALGOD_TOKEN, help="Algod token")
    parser.add_argument("--out", type=str, default=None, help="Output file path")
    args = parser.parse_args()

    hdr = generate_402(
        price=args.price,
        asset_id=args.asset,
        pay_to=args.pay_to,
        fee_payer_mnemonic=args.fee_payer_mnemonic,
        network=args.network,
        algod_url=args.algod_url,
        algod_token=args.algod_token,
    )

    if args.out:
        out_path = Path(args.out)
        out_path.write_text(hdr.strip())
        print(f"Wrote {out_path} ({len(hdr)} chars)")
    elif len(sys.argv) == 1:
        out_file = FIXTURES_DIR / "payment_required.b64"
        out_file.write_text(hdr.strip())
        print(f"Wrote {out_file} ({len(hdr)} chars)")
    print(hdr)


if __name__ == "__main__":
    main()
